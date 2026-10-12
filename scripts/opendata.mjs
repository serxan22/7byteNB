// Official opendata.az datasets → data/processed/opendata.json (+ metro-official.json, settlements.json).
// Inputs (data/raw/opendata/, see sources): pathways.csv (metro exits), passenger_2025.csv, rayonlar.geojson,
// settlements.geojson, poi.geojson, roads.csv, railways.geojson, meta-*.json (CKAN package_show).
// Nothing here merges official counts into OSM counts — the POI comparison is reported side by side only.
import fs from "node:fs";
import turfArea from "@turf/area";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { gazKey, gazStems } from "../src/lib/decide.ts";

const D = "data/raw/opendata";
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const csv = (f, sep) => fs.readFileSync(f, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).map((l) => l.split(sep).map((s) => s.replace(/^"|"$/g, "").trim()));
// run after process-osm (fresh OSM counts + current outlines); boundary comparison is frozen once made (see below)
const regions = read("data/processed/osm-regions.json");
const geo = [...read("public/data/regions-az.geojson").features, ...read("public/data/regions-baku.geojson").features];
// public geojsons store an area as several features (islands, separate parts) → merge per id into one MultiPolygon
const geoById = new Map();
for (const f of geo) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const g = geoById.get(f.properties.id) ?? { type: "Feature", properties: f.properties, geometry: { type: "MultiPolygon", coordinates: [] } };
  g.geometry.coordinates.push(...polys);
  geoById.set(f.properties.id, g);
}
const norm = (s) => s.toLocaleLowerCase("az").replace(/\s+(rayonu|şəhəri|şəhər)$/u, "").trim();
const idByName = new Map(regions.map((r) => [norm(r.name), r.id]));
const M_PER_DEG = 111320;
const distM = (a, b) => { const k = Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180); return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * M_PER_DEG; };
const round = (v, d = 0) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const out = {};

// ---------- 1. metro: station = group of exits; names normalised to the official 27-station list ----------
const METRO = read("data/manual/metro-stations.json");
const ALIAS = { ...METRO.aliases, "28.05.2026 00:00:00": "28 May", "Memar Əcəmi 2": "Memar Əcəmi-2", Koroglu: "Koroğlu", "Xətai": METRO.stations.find((n) => n.endsWith("Xətai")) };
const canon = (n) => ALIAS[n] ?? n;
const EN_FIX = { "8 Novabr": "8 Noyabr", Insahatchilar: "Inshaatchilar" };
const stations = new Map();
for (const [az, en, lat, lon] of csv(`${D}/pathways.csv`, ";").slice(1)) {
  const name = canon(az);
  const s = stations.get(name) ?? { name, name_en: EN_FIX[en] ?? en, exits: [] };
  s.exits.push([+lon / 1e6, +lat / 1e6]);
  stations.set(name, s);
}
// average weekday passengers, 2025 (one row per station-day). 2026 file has several unexplained rows per day → not used.
const pax = new Map();
for (const [date, st, n] of csv(`${D}/passenger_2025.csv`, ";").slice(1)) {
  const day = new Date(date.slice(0, 10)).getUTCDay();
  if (day === 0 || day === 6 || !Number.isFinite(+n)) continue;
  const p = pax.get(canon(st)) ?? { sum: 0, days: 0 };
  p.sum += +n; p.days++;
  pax.set(canon(st), p);
}
const metro = [...stations.values()].map((s) => ({
  ...s,
  c: [round(s.exits.reduce((a, e) => a + e[0], 0) / s.exits.length, 6), round(s.exits.reduce((a, e) => a + e[1], 0) / s.exits.length, 6)],
  pax_weekday: pax.has(s.name) ? Math.round(pax.get(s.name).sum / pax.get(s.name).days) : null,
  pax_days: pax.get(s.name)?.days ?? 0,
}));
const unknown = metro.filter((s) => !METRO.stations.includes(s.name)).map((s) => s.name);
if (unknown.length) throw new Error(`metro: names not in the official list: ${unknown.join(", ")}`);
fs.writeFileSync("data/processed/metro-official.json", JSON.stringify({ year: 2025, stations: metro }, null, 1));
// stations per area (Baku districts + Bakı itself), by where the centre of a station's exits lies
out.metro_by_region = {};
for (const st of metro)
  for (const r of regions)
    if (geoById.has(r.id) && booleanPointInPolygon(st.c, geoById.get(r.id))) (out.metro_by_region[r.id] ??= []).push({ name: st.name, pax_weekday: st.pax_weekday });
out.metro_by_region["az-baki"] = metro.map((st) => ({ name: st.name, pax_weekday: st.pax_weekday }));
console.log(`metro: ${metro.length} stations, ${metro.reduce((a, s) => a + s.exits.length, 0)} exits, pax for ${metro.filter((s) => s.pax_weekday).length}`);

// ---------- 2. rayon boundaries: IoU of official polygon vs ours ----------
const offRayons = read(`${D}/rayonlar.geojson`).features;
// IoU by point sampling on a 120×120 grid over the union bbox (turf intersect silently fails on some of these MultiPolygons)
const bboxOf = (f) => { const b = [180, 90, -180, -90]; const w = (c) => (typeof c[0] === "number" ? (b[0] = Math.min(b[0], c[0]), b[1] = Math.min(b[1], c[1]), b[2] = Math.max(b[2], c[0]), b[3] = Math.max(b[3], c[1])) : c.forEach(w)); w(f.geometry.coordinates); return b; };
const gridIoU = (a, b) => {
  const A = bboxOf(a), B = bboxOf(b), x0 = Math.min(A[0], B[0]), y0 = Math.min(A[1], B[1]), x1 = Math.max(A[2], B[2]), y1 = Math.max(A[3], B[3]);
  let inter = 0, uni = 0;
  for (let i = 0; i < 120; i++) for (let j = 0; j < 120; j++) {
    const p = [x0 + ((i + 0.5) / 120) * (x1 - x0), y0 + ((j + 0.5) / 120) * (y1 - y0)];
    const ia = booleanPointInPolygon(p, a), ib = booleanPointInPolygon(p, b);
    if (ia && ib) inter++;
    if (ia || ib) uni++;
  }
  return uni ? inter / uni : null;
};
const offById = new Map(); // official rayon ID → our id
// The comparison is frozen in boundary-overrides.json once made (after replacement our shapes ARE the official ones);
// delete that file to recompute.
const OVR_FILE = "data/processed/boundary-overrides.json";
const frozen = fs.existsSync(OVR_FILE) ? read(OVR_FILE) : null;
const KEEP = (id) => id.startsWith("bk-") || ["az-baki", "az-sumqayit", "az-gence", "az-abseron"].includes(id);
out.boundaries = frozen?.comparison ?? {};
for (const f of frozen ? [] : offRayons) {
  const id = idByName.get(norm(f.properties.Name_AZ));
  if (!id) continue;
  offById.set(String(f.properties.ID), id);
  const ours = geoById.get(id);
  if (!ours) { out.boundaries[id] = { iou: null, missing: true }; continue; }
  out.boundaries[id] = { iou: round(gridIoU(ours, f), 3), official_km2: round(turfArea(f) / 1e6, 1), ours_km2: round(turfArea(ours) / 1e6, 1) };
}
for (const f of offRayons) { const id = idByName.get(norm(f.properties.Name_AZ)); if (id) offById.set(String(f.properties.ID), id); }
if (!frozen) {
  const overrides = {};
  for (const f of offRayons) {
    const id = idByName.get(norm(f.properties.Name_AZ)), b = id && out.boundaries[id];
    if (!b) continue;
    b.replaced = (b.iou == null || b.iou < 0.9) && !KEEP(id);
    b.kept_reason = (b.iou == null || b.iou < 0.9) && KEEP(id) ? "mahalle" : undefined;
    if (b.replaced) overrides[id] = f.geometry;
  }
  fs.writeFileSync(OVR_FILE, JSON.stringify({ comparison: out.boundaries, overrides }));
}
console.log(`boundaries: ${Object.keys(out.boundaries).length} compared; IoU<0.9: ${Object.entries(out.boundaries).filter(([, b]) => b.iou != null && b.iou < 0.9).map(([k, b]) => `${k} ${b.iou}`).join(", ") || "none"}`);

// ---------- 3. settlement gazetteer (PARENT_ID → rayon; Gəncə's parent id 2001 is resolved by STATE_AZ) ----------
const settlements = read(`${D}/settlements.geojson`).features.map((f) => {
  const p = f.properties;
  const rayon_id = offById.get(String(p.PARENT_ID)) ?? idByName.get(norm(p.STATE_AZ ?? "")) ?? null;
  return { id: p.ID, name: p.NAME_AZ?.trim(), name_en: p.NAME?.trim() || null, type: p.TYPE_AZ, rayon_id, c: f.geometry.coordinates.map((x) => round(x, 5)) };
});
fs.writeFileSync("data/processed/settlements.json", JSON.stringify(settlements));
// compact gazetteer for the app (intent resolution) + official English names on our village records
// compact rows [name, englishName|0, type 0=kənd 1=qəsəbə 2=şəhər, rayonId] + stoplist of common words that are also
// settlement names: fixed real-estate terms + every word of our intent-eval queries and listing texts, except a word that
// resolves to that query's own expected rayon (so "Lahıcda" in a Lahıc test is not stoplisted, "3 otaqlı" is).
const TYPE_CODE = { "kənd": 0, "qəsəbə": 1, "şəhər": 2 };
const gazRows = settlements.filter((x) => x.name && x.rayon_id).map((x) => [x.name, x.name_en && x.name_en !== x.name ? x.name_en : 0, TYPE_CODE[x.type] ?? 0, x.rayon_id]);
const keyRayons = new Map();
for (const g of gazRows) for (const n of [g[0], g[1]]) if (n) (keyRayons.get(gazKey(n)) ?? keyRayons.set(gazKey(n), new Set()).get(gazKey(n))).add(g[3]);
const FIXED = ["otaqlı", "otaq", "yeni", "köhnə", "mərkəz", "mərkəzi", "bağ", "bağlar", "ev", "evi", "mənzil", "həyət", "dəniz", "sahil", "metro", "dağ", "kənd", "qəsəbə", "park", "bina", "tikili", "təmir", "təmirli", "satılır", "kirayə", "ucuz", "baha", "yaxın", "uzaq", "torpaq", "obyekt", "villa", "kupça", "çıxarış", "sənəd", "qaz", "işıq", "su", "bazar", "məktəb", "bağça", "market", "aptek"];
const stop = new Set(FIXED.map(gazKey).filter((k) => keyRayons.has(k)));
// listing texts have no expected location, so only their lowercase words count (capitalised ones are place names: "Masazırda")
const lowerOnly = (t) => t.split(/[^\p{L}\p{N}]+/u).filter((w) => !/^\p{Lu}/u.test(w)).join(" ");
const texts = [...read("evals/data/intent-cases.json"), ...read("evals/data/intent-cases-en.json")].map((c) => [c.q, c.locs]).concat(read("evals/data/legal-cases.json").map((c) => [lowerOnly(c.t), []]));
for (const [t, locs] of texts)
  for (const tok of gazKey(t).split(" "))
    for (const st of gazStems(tok)) if (keyRayons.has(st) && ![...keyRayons.get(st)].some((r) => locs.includes(r))) stop.add(st);
fs.writeFileSync("public/data/gazetteer.json", JSON.stringify({ stop: [...stop].sort(), rows: gazRows }));
console.log(`gazetteer stoplist: ${stop.size} words — ${[...stop].sort().join(", ")}`);
const sd = read("public/data/settlements.json");
const enByKey = new Map(settlements.map((x) => [`${x.rayon_id}|${norm(x.name ?? "")}`, x.name_en]));
let named = 0;
for (const z of sd.settlements) { const ne = enByKey.get(`${z.r}|${norm(z.n)}`); if (ne) { z.ne = ne; named++; } else delete z.ne; }
fs.writeFileSync("public/data/settlements.json", JSON.stringify(sd));
console.log(`gazetteer: ${settlements.length}; our village records with official EN name: ${named}/${sd.settlements.length}`);
console.log(`settlements: ${settlements.length}, unmapped: ${settlements.filter((s) => !s.rayon_id).length}`);

// ---------- 4. POI cross-check (official vs OSM, side by side; Baku districts + Sumqayıt + Abşeron) ----------
const CAT = { SCHOOL: "school", KINDERGARTEN: "kindergarten", HOSPITAL: "hospital", PHARMACY: "pharmacy", GROCERY_STORE: "grocery", BANK: "bank_atm", PARK: "park" };
const poiAreas = regions.filter((r) => r.level === "baku_district" || ["az-sumqayit", "az-abseron"].includes(r.id));
const poi = read(`${D}/poi.geojson`).features;
const official = Object.fromEntries(poiAreas.map((r) => [r.id, Object.fromEntries(Object.values(CAT).map((c) => [c, 0]))]));
let checking = 0, customizable = 0, outside = 0;
for (const f of poi) {
  const t = f.properties.TYPE ?? "";
  if (t.startsWith("CUSTOMIZABLE_POINT")) { customizable++; continue; }
  if (/check/i.test(f.properties.status ?? "")) checking++;
  const cat = CAT[t];
  if (!cat) continue;
  const r = poiAreas.find((a) => geoById.get(a.id) && booleanPointInPolygon(f.geometry.coordinates, geoById.get(a.id)));
  if (!r) { outside++; continue; }
  official[r.id][cat]++;
}
out.poi_check = {
  categories: Object.values(CAT),
  types_in_file: [...new Set(poi.map((f) => f.properties.TYPE))].length,
  status_checking: checking, customizable_ignored: customizable, outside_areas: outside,
  areas: Object.fromEntries(poiAreas.map((r) => [r.id, Object.fromEntries(Object.values(CAT).map((c) => [c, { osm: r.pois[c] ?? 0, official: official[r.id][c] }]))])),
};
console.log(`poi: ${poi.length} features, "Checking" ${checking}, CUSTOMIZABLE ignored ${customizable}, outside areas ${outside}`);

// ---------- 5a. roads: public road km per rayon (latest year with a value, and 2004) → km per 100 km² ----------
const rows = csv(`${D}/roads.csv`, ",");
const head = rows[0];
const years = rows.slice(1).map((r) => +r[0]);
out.roads = {};
head.forEach((h, i) => {
  const id = idByName.get(norm(h.replace(/\s*\(kilometr\)/, "")));
  if (!id || id === "az-baki" || i < 2) return;
  const series = rows.slice(1).map((r) => ({ year: +r[0], km: /^\d+(\.\d+)?$/.test(r[i]) ? +r[i] : null /* "..." and "-" = missing */ })).filter((x) => x.km != null).sort((a, b) => a.year - b.year);
  if (!series.length) return;
  const last = series[series.length - 1], first = series[0];
  const area = regions.find((r) => r.id === id)?.area_km2;
  out.roads[id] = { km: last.km, year: last.year, first_km: first.km, first_year: first.year, density: area ? round((last.km / area) * 100, 1) : null };
});
console.log(`roads: ${Object.keys(out.roads).length} rayons (years ${Math.min(...years)}–${Math.max(...years)})`);

// ---------- 5b. railways: distance from each area centroid (regions + mahalle) to the nearest line ----------
const segs = [];
for (const f of read(`${D}/railways.geojson`).features) {
  const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const l of lines) for (let i = 1; i < l.length; i++) segs.push([l[i - 1], l[i]]);
}
const segDist = (p, [a, b]) => {
  const k = Math.cos((p[1] * Math.PI) / 180);
  const ax = (a[0] - p[0]) * k, ay = a[1] - p[1], bx = (b[0] - p[0]) * k, by = b[1] - p[1];
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy) * M_PER_DEG;
};
const railDist = (p) => { let best = Infinity; for (const s of segs) { if (Math.abs(s[0][1] - p[1]) > 0.5 && Math.abs(s[1][1] - p[1]) > 0.5) continue; const d = segDist(p, s); if (d < best) best = d; } return Number.isFinite(best) ? Math.round(best) : null; };
out.rail = { regions: Object.fromEntries(regions.map((r) => [r.id, railDist(r.centroid)])), mahalle: {} };
const mh = read("public/data/mahalle.json");
for (const h of mh.hexes) h.rl = out.rail.mahalle[h.h] = railDist(h.c); // rl = metres to the nearest railway line (official)
fs.writeFileSync("public/data/mahalle.json", JSON.stringify(mh));
console.log(`rail: ${segs.length} segments; mahalle <300 m: ${Object.values(out.rail.mahalle).filter((d) => d != null && d < 300).length}`);

// ---------- dataset metadata for /menbeler (CKAN package_show) ----------
const DATA_FILE = { "metro-cixislari-uzre-koordinatlar": "pathways.csv", "stansiyalar-uzre-gundelik-sernisin-gedislerinin-sayi": "passenger_2025.csv", "azerbaycanin-rayonlari": "rayonlar.geojson", "azerbaycanin-seherleri-ve-inzibati-erazi-vahidleri": "settlements.geojson", "azerbaycanda-obyektler-ve-mekanlar": "poi.geojson", "umumi-istifadede-olan-avtomobil-yollarinin-uzunlugu-seher-ve-rayonlar-uzre": "roads.csv", "azerbaycanin-demir-yollarinin-kordinatlari": "railways.geojson" };
out.meta = fs.readdirSync(D).filter((f) => f.startsWith("meta-")).map((f) => {
  const r = read(`${D}/${f}`).result;
  const dataFile = `${D}/${DATA_FILE[r.name] ?? f}`;
  return { name: r.name, title: r.title, publisher: r.organization?.title ?? null, url: `https://opendata.az/@${r.organization?.name}/${r.name}`, modified: r.metadata_modified?.slice(0, 10) ?? null, license: r.license_title || null, downloaded: fs.statSync(fs.existsSync(dataFile) ? dataFile : `${D}/${f}`).mtime.toISOString().slice(0, 10) };
});
fs.writeFileSync("data/processed/opendata.json", JSON.stringify(out));
console.log(`opendata.json written (${(fs.statSync("data/processed/opendata.json").size / 1024).toFixed(0)} KB)`);
