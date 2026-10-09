// Micro-areas: H3 res-8 hexes (~0.74 km²) over Baku, Sumqayıt and Gəncə built-up areas (hex with ≥1 POI or road).
// Out: public/data/hexes.json (metrics) + public/data/hexes-geo.json (boundaries).
import fs from "node:fs";
import readline from "node:readline";
import { latLngToCell, cellToLatLng, cellToBoundary } from "h3-js";
import turfBbox from "@turf/bbox";
import turfLength from "@turf/length";
import pip from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";

const O = "data/raw/osm";
const RES = 8;
async function* seq(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) if (line.length > 2) yield JSON.parse(line.replace(/^\x1e/, ""));
}

// target polygons: Baku districts + Sumqayıt + Gəncə
const bk = JSON.parse(fs.readFileSync("public/data/regions-baku.geojson", "utf8")).features;
const az = JSON.parse(fs.readFileSync("public/data/regions-az.geojson", "utf8")).features.filter((f) => ["az-sumqayit", "az-gence"].includes(f.properties.id));
const targets = [...bk, ...az].map((f) => ({ f, id: f.properties.id, name: f.properties.name, b: turfBbox(f) }));
const locate = (lon, lat) => {
  const pt = point([lon, lat]);
  return targets.find((t) => lon >= t.b[0] && lon <= t.b[2] && lat >= t.b[1] && lat <= t.b[3] && pip(pt, t.f)) ?? null;
};
const BOX = [Math.min(...targets.map((t) => t.b[0])), Math.min(...targets.map((t) => t.b[1])), Math.max(...targets.map((t) => t.b[2])), Math.max(...targets.map((t) => t.b[3]))];
const inBox = (lon, lat) => lon >= BOX[0] && lon <= BOX[2] && lat >= BOX[1] && lat <= BOX[3];

const CATS = ["pharmacy", "grocery", "mall", "bazaar", "food", "school", "kindergarten", "university", "hospital", "clinic", "bank_atm", "fuel", "sport", "park"];
function cats(t) {
  const c = [], a = t.amenity, s = t.shop, l = t.leisure;
  if (a === "pharmacy") c.push("pharmacy");
  if (["supermarket", "convenience", "greengrocer"].includes(s)) c.push("grocery");
  if (s === "mall") c.push("mall");
  if (a === "marketplace") c.push("bazaar");
  if (["restaurant", "cafe", "fast_food"].includes(a)) c.push("food");
  if (a === "school") c.push("school");
  if (a === "kindergarten") c.push("kindergarten");
  if (a === "university" || a === "college") c.push("university");
  if (a === "hospital") c.push("hospital");
  if (a === "clinic" || a === "doctors") c.push("clinic");
  if (a === "bank" || a === "atm") c.push("bank_atm");
  if (a === "fuel") c.push("fuel");
  if (["sports_centre", "fitness_centre", "stadium"].includes(l)) c.push("sport");
  if (l === "park") c.push("park");
  return c;
}
const rep = (g) => {
  if (g.type === "Point") return g.coordinates;
  const b = turfBbox(g);
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
};
const cells = new Map();
const cell = (h) => {
  if (!cells.has(h)) cells.set(h, { p: new Array(CATS.length).fill(0), road: 0, paved: 0, unpaved: 0, stops: 0 });
  return cells.get(h);
};
const metro = [], stops = [], schools = [], kgs = [], parks = [];
for await (const f of seq(`${O}/pois.geojsonseq`)) {
  const [lon, lat] = rep(f.geometry);
  if (!inBox(lon, lat) || !locate(lon, lat)) continue;
  const t = f.properties;
  const h = latLngToCell(lat, lon, RES);
  const c = cell(h);
  for (const k of cats(t)) c.p[CATS.indexOf(k)]++;
  if (t.station === "subway") metro.push({ ll: [lon, lat], name: (t["name:az"] || t.name || "").replace(/ metro stansiyası| m\/s/i, "") });
  if (t.highway === "bus_stop") { stops.push([lon, lat]); c.stops++; }
  if (t.amenity === "school") schools.push([lon, lat]);
  if (t.amenity === "kindergarten") kgs.push([lon, lat]);
  if (t.leisure === "park") parks.push([lon, lat]);
}
const PAVED = new Set(["asphalt", "concrete", "paved", "paving_stones", "concrete:plates", "sett", "chipseal"]);
const UNPAVED = new Set(["unpaved", "dirt", "ground", "gravel", "compacted", "sand", "grass", "fine_gravel", "earth", "mud", "pebblestone"]);
for await (const f of seq(`${O}/roads.geojsonseq`)) {
  const co = f.geometry.coordinates;
  const [lon, lat] = co[Math.floor(co.length / 2)];
  if (!inBox(lon, lat) || !locate(lon, lat)) continue;
  const c = cell(latLngToCell(lat, lon, RES));
  const km = turfLength(f);
  const s = f.properties.surface;
  c.road += km;
  if (s && PAVED.has(s)) c.paved += km;
  else if ((s && UNPAVED.has(s)) || (!s && f.properties.highway === "track")) c.unpaved += km;
}
const places = [];
for await (const f of seq(`${O}/places.geojsonseq`)) {
  const [lon, lat] = f.geometry.coordinates;
  if (!inBox(lon, lat)) continue;
  const name = f.properties["name:az"] || f.properties.name;
  if (name && ["suburb", "neighbourhood", "quarter", "village", "town", "hamlet"].includes(f.properties.place)) places.push({ ll: [lon, lat], name });
}
const m = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110570);
const nearest = (pts, p, get = (x) => x) => {
  let best = null, d = Infinity;
  for (const x of pts) {
    const dd = m(get(x), p);
    if (dd < d) { d = dd; best = x; }
  }
  return { best, d: Math.round(d) };
};

const hexes = [], features = [];
for (const [h, c] of cells) {
  const nPoi = c.p.reduce((a, b) => a + b, 0);
  if (nPoi < 1 && c.road < 0.3) continue;
  const [lat, lon] = cellToLatLng(h);
  const reg = locate(lon, lat) ?? locate(...rep({ type: "Point", coordinates: [lon, lat] }));
  if (!reg) continue;
  const ll = [lon, lat];
  const mt = nearest(metro, ll, (x) => x.ll);
  const pl = nearest(places, ll, (x) => x.ll);
  const known = c.paved + c.unpaved;
  const place = pl.best && pl.d < 3000 ? pl.best.name : null;
  const metroLabel = mt.best && mt.d < 900 && mt.best.name ? `${mt.best.name} m. ətrafı` : null;
  hexes.push({
    h,
    c: [+lon.toFixed(5), +lat.toFixed(5)],
    r: reg.id,
    l: [reg.name, metroLabel ?? place].filter(Boolean).join(" · "),
    p: c.p,
    st: c.stops,
    m: metro.length ? mt.d : null,
    mn: mt.best?.name || null,
    s: nearest(stops, ll).d,
    sc: schools.length ? nearest(schools, ll).d : null,
    k: kgs.length ? nearest(kgs, ll).d : null,
    pk: parks.length ? nearest(parks, ll).d : null,
    rk: +c.road.toFixed(2),
    pv: known >= 0.2 ? Math.round((c.paved / known) * 100) : null,
  });
  const ring = cellToBoundary(h, true).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
  features.push({ type: "Feature", properties: { id: h, r: reg.id }, geometry: { type: "Polygon", coordinates: [ring] } });
}
fs.writeFileSync("public/data/hexes.json", JSON.stringify({ res: RES, cats: CATS, hexes }));
fs.writeFileSync("public/data/hexes-geo.json", JSON.stringify({ type: "FeatureCollection", features }));
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
const byReg = hexes.reduce((o, x) => ((o[x.r] = (o[x.r] || 0) + 1), o), {});
console.log(`hexes: ${hexes.length} (${kb("public/data/hexes.json")} KB + geo ${kb("public/data/hexes-geo.json")} KB); metro pts ${metro.length}; places ${places.length}`);
console.log(JSON.stringify(byReg));
console.log(JSON.stringify(hexes.find((x) => x.r === "bk-nerimanov" && x.m < 500)));
