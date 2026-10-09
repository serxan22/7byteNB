// C2: point micro-areas outside Baku/Sumqayıt/Gəncə — OSM place=town|village with stats within 1.5 km.
// Out: public/data/settlements.json
import fs from "node:fs";
import readline from "node:readline";
import turfBbox from "@turf/bbox";
import pip from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";

const O = "data/raw/osm";
async function* seq(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) if (line.length > 2) yield JSON.parse(line.replace(/^\x1e/, ""));
}
const az = JSON.parse(fs.readFileSync("public/data/regions-az.geojson", "utf8")).features.map((f) => ({ f, id: f.properties.id, name: f.properties.name, b: turfBbox(f) }));
const locate = (lon, lat) => {
  const pt = point([lon, lat]);
  return az.find((t) => lon >= t.b[0] && lon <= t.b[2] && lat >= t.b[1] && lat <= t.b[3] && pip(pt, t.f)) ?? null;
};
const EXCLUDE = new Set(["az-baki", "az-sumqayit", "az-gence"]);
const CATS = ["pharmacy", "grocery", "food", "school", "kindergarten", "hospital", "clinic", "bank_atm", "park"];
const cat = (t) => {
  const a = t.amenity, s = t.shop;
  if (a === "pharmacy") return "pharmacy";
  if (["supermarket", "convenience", "greengrocer"].includes(s)) return "grocery";
  if (["restaurant", "cafe", "fast_food"].includes(a)) return "food";
  if (a === "school") return "school";
  if (a === "kindergarten") return "kindergarten";
  if (a === "hospital") return "hospital";
  if (a === "clinic" || a === "doctors") return "clinic";
  if (a === "bank" || a === "atm") return "bank_atm";
  if (t.leisure === "park") return "park";
  return null;
};
const CELL = 0.02;
const grid = new Map();
const add = (lon, lat, c) => {
  const k = `${Math.floor(lon / CELL)}:${Math.floor(lat / CELL)}`;
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push([lon, lat, c]);
};
for await (const f of seq(`${O}/pois.geojsonseq`)) {
  const g = f.geometry;
  let lon, lat;
  if (g.type === "Point") [lon, lat] = g.coordinates;
  else { const b = turfBbox(g); lon = (b[0] + b[2]) / 2; lat = (b[1] + b[3]) / 2; }
  const c = f.properties.highway === "bus_stop" ? "stop" : cat(f.properties);
  if (c) add(lon, lat, c);
}
const m = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110570);
const near = (lon, lat, rCells) => {
  const out = [];
  const cx = Math.floor(lon / CELL), cy = Math.floor(lat / CELL);
  for (let x = cx - rCells; x <= cx + rCells; x++) for (let y = cy - rCells; y <= cy + rCells; y++) out.push(...(grid.get(`${x}:${y}`) ?? []));
  return out;
};
const out = [];
for await (const f of seq(`${O}/places.geojsonseq`)) {
  const p = f.properties;
  if (!["town", "village"].includes(p.place)) continue;
  const name = p["name:az"] || p.name;
  if (!name || /[԰-֏؀-ۿ]/.test(name)) continue; // skip non-Latin (foreign) names
  const [lon, lat] = f.geometry.coordinates;
  const reg = locate(lon, lat);
  if (!reg || EXCLUDE.has(reg.id)) continue;
  const counts = new Array(CATS.length).fill(0);
  let stop = null;
  for (const [x, y, c] of near(lon, lat, 2)) {
    const d = m([x, y], [lon, lat]);
    if (c === "stop") { if (stop == null || d < stop) stop = d; continue; }
    if (d <= 1500) counts[CATS.indexOf(c)]++;
  }
  const n = counts.reduce((a, b) => a + b, 0);
  if (n === 0 && p.place !== "town") continue;
  out.push({ id: `st-${p["@id"] ?? out.length}`, n: name, t: p.place === "town" ? 1 : 0, c: [+lon.toFixed(4), +lat.toFixed(4)], r: reg.id, p: counts, s: stop == null ? null : Math.round(stop) });
}
fs.writeFileSync("public/data/settlements.json", JSON.stringify({ cats: CATS, radius_m: 1500, settlements: out }));
const byR = out.reduce((o, x) => ((o[x.r] = (o[x.r] || 0) + 1), o), {});
console.log(`settlements: ${out.length} (${(fs.statSync("public/data/settlements.json").size / 1024).toFixed(0)} KB) in ${Object.keys(byR).length} rayons; e.g. ${JSON.stringify(out.find((x) => x.r === "az-quba"))}`);
