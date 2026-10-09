// Aggregates a user-provided bina.az listings dataset (~/Downloads/house_sale.csv, collected by a third party; we do
// not scrape). Only aggregates are kept: medians per region × type (n ≥ 8), per H3 hex (n ≥ 5), deed/mortgage shares.
// No row-level data, no owner names, no URLs are written anywhere.
// Out: data/processed/listings-agg.json; updates data/manual/prices.csv (mock rows → sample medians); hexes.json "pm"/"pn".
import fs from "node:fs";
import os from "node:os";
import { parse } from "csv-parse";
import { latLngToCell } from "h3-js";
import turfBbox from "@turf/bbox";
import pip from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";

const SRC = process.argv[2] || `${os.homedir()}/Downloads/house_sale.csv`;
const TYPE = { "Yeni tikili": "menzil_yeni", "Köhnə tikili": "menzil_kohne", "Həyət evi/Bağ evi": "heyet_evi", Obyekt: "obyekt", Ofis: "obyekt", Torpaq: "torpaq" };
const num = (s) => {
  const m = String(s ?? "").replace(/\s/g, "").replace(",", ".").match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
};
const feats = (f) => JSON.parse(fs.readFileSync(f, "utf8")).features.map((x) => ({ f: x, id: x.properties.id, b: turfBbox(x) }));
const bk = feats("public/data/regions-baku.geojson"), az = feats("public/data/regions-az.geojson");
const find = (list, lon, lat) => {
  const pt = point([lon, lat]);
  return list.find((t) => lon >= t.b[0] && lon <= t.b[2] && lat >= t.b[1] && lat <= t.b[3] && pip(pt, t.f))?.id ?? null;
};

const seen = new Set();
const byReg = {}, byHex = {}, deed = {}, dates = [];
let rows = 0, kept = 0, noGeo = 0, outlier = 0;
const push = (o, k, t, v) => (((o[k] ||= {})[t] ||= []).push(v));
const parser = fs.createReadStream(SRC).pipe(parse({ columns: true, relax_quotes: true, relax_column_count: true, skip_records_with_error: true }));
for await (const r of parser) {
  rows++;
  const key = r.estate_id || r.id_y || r.estate_rel_url_x;
  if (!key || seen.has(key)) continue;
  seen.add(key);
  const t = TYPE[r.Kateqoriya];
  const price = num(r.price);
  const lat = parseFloat(r.lat), lon = parseFloat(r.lng);
  if (!t || !price || (r.currency_x && r.currency_x !== "AZN")) continue;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) { noGeo++; continue; }
  const unit = t === "torpaq" ? num(r["Torpaq sahəsi"]) : num(r["Sahə"]);
  if (!unit) continue;
  const v = price / unit;
  const ok = t === "torpaq" ? v >= 300 && v <= 400000 : v >= 200 && v <= 25000;
  if (!ok) { outlier++; continue; }
  const b = find(bk, lon, lat);
  const a = b ? "az-baki" : find(az, lon, lat);
  if (!a) { noGeo++; continue; }
  kept++;
  for (const id of [b, a].filter(Boolean)) {
    push(byReg, id, t, v);
    const d = (deed[id] ||= { n: 0, deed: 0, mortgage: 0 });
    d.n++;
    if (r["Çıxarış"] === "var" || r.bill_of_sale) d.deed++;
    if (r["İpoteka"] === "var" || r.mortgage) d.mortgage++;
  }
  if (t === "menzil_kohne" || t === "menzil_yeni") push(byHex, latLngToCell(lat, lon, 8), "menzil", v);
  const dt = (r.datetime_scrape_x || r.datetime_scrape_y || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dt)) dates.push(dt);
}
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
dates.sort();
const period = dates.length ? `${dates[0].slice(0, 7)}–${dates.at(-1).slice(0, 7)}` : "tarix məlum deyil";
const regions = {};
for (const [id, types] of Object.entries(byReg)) {
  regions[id] = { types: {}, deed_share: Math.round((deed[id].deed / deed[id].n) * 100), mortgage_share: Math.round((deed[id].mortgage / deed[id].n) * 100), n: deed[id].n };
  for (const [t, vals] of Object.entries(types)) if (vals.length >= 8) regions[id].types[t] = { median: Math.round(median(vals)), n: vals.length };
}
const hexes = {};
for (const [h, o] of Object.entries(byHex)) if (o.menzil.length >= 5) hexes[h] = { median: Math.round(median(o.menzil)), n: o.menzil.length };
fs.writeFileSync("data/processed/listings-agg.json", JSON.stringify({ source: "bina.az elanları — istifadəçinin təqdim etdiyi dataset (üçüncü tərəf tərəfindən toplanıb)", period, rows, unique: seen.size, kept, no_geo: noGeo, outliers: outlier, regions, hexes }, null, 1));

// prices.csv: replace mock rows with sample medians; add rows for newly covered regions. Published (estimate/official) rows are kept.
const csvPath = "data/manual/prices.csv";
const lines = fs.readFileSync(csvPath, "utf8").trim().split("\n");
const header = lines[0];
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
const names = Object.fromEntries([...bk, ...az].map((x) => [x.id, x.f.properties.name]));
const existing = new Map(lines.slice(1).map((l) => [l.split(",").slice(0, 3).filter((_, i) => i !== 1).join("|"), l]));
const src = q(`bina.az elanlarının medianı (istifadəçi datasetı, ${period})`);
let replaced = 0, added = 0;
for (const [id, o] of Object.entries(regions)) {
  for (const [t, s] of Object.entries(o.types)) {
    const k = `${id}|${t}`;
    const unit = t === "torpaq" ? "AZN_sot" : "AZN_m2";
    const row = [id, q(names[id] ?? id), t, s.median, unit, s.n, src, "", "2026-10-09", "sample"].join(",");
    const prev = existing.get(k);
    if (prev && !prev.endsWith(",mock")) continue;
    if (prev) replaced++;
    else added++;
    existing.set(k, row);
  }
}
fs.writeFileSync(csvPath, [header, ...existing.values()].join("\n") + "\n");

// hex medians into hexes.json
const hx = JSON.parse(fs.readFileSync("public/data/hexes.json", "utf8"));
let hexWith = 0;
for (const h of hx.hexes) {
  const s = hexes[h.h];
  if (s) { h.pm = s.median; h.pn = s.n; hexWith++; } else { delete h.pm; delete h.pn; }
}
fs.writeFileSync("public/data/hexes.json", JSON.stringify(hx));
console.log(`rows ${rows}, unique ${seen.size}, kept ${kept}, no-geo ${noGeo}, outliers ${outlier}, period ${period}`);
console.log(`regions with medians: ${Object.values(regions).filter((r) => Object.keys(r.types).length).length}; prices.csv mock→sample ${replaced}, new rows ${added}; hexes with median ${hexWith}`);
console.log("Baku:", JSON.stringify(regions["az-baki"]), "\nNərimanov:", JSON.stringify(regions["bk-nerimanov"]));
