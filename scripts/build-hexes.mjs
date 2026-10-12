// Micro-areas: H3 res-8 honeycomb (~0.74 km²) cut to the shape of each region (Baku districts, Sumqayıt, Gəncə).
// Every overlapping cell is clipped to its region polygon → pieces "<h3>_<regionId>"; slivers (<5% of a hex) are
// dropped and their stats merged into a neighbouring piece of the same region. Stats use the clipped geometry.
// Cache: data/raw/hexes/pieces.json (clipping step). Out: public/data/hexes.json + public/data/hexes-geo.json.
import fs from "node:fs";
import readline from "node:readline";
import { latLngToCell, cellToBoundary, polygonToCellsExperimental, POLYGON_TO_CELLS_FLAGS, gridDisk } from "h3-js";
import turfArea from "@turf/area";
import turfCentroid from "@turf/centroid";
import turfIntersect from "@turf/intersect";
import turfBbox from "@turf/bbox";
import turfLength from "@turf/length";
import pip from "@turf/boolean-point-in-polygon";
import { point, polygon, featureCollection } from "@turf/helpers";

const O = "data/raw/osm";
// Official station list validates OSM: depots, exits and planned stations tagged station=subway are dropped.

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
// ---- step 1 (cached): honeycomb clipped to region polygons ----
const CACHE = "data/raw/hexes/pieces.json";
let cache;
if (fs.existsSync(CACHE)) cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
else {
  const pieces = {}, slivers = {};
  for (const t of targets) {
    const polys = t.f.geometry.type === "Polygon" ? [t.f.geometry.coordinates] : t.f.geometry.coordinates;
    const hs = new Set(polys.flatMap((pc) => polygonToCellsExperimental(pc, RES, POLYGON_TO_CELLS_FLAGS.containmentOverlapping, true)));
    for (const h of hs) {
      const hex = polygon([cellToBoundary(h, true)]);
      const full = turfArea(hex);
      const g = turfIntersect(featureCollection([hex, t.f])); // always clip: a concave border can cut between vertices
      if (!g) continue;
      const a = turfArea(g);
      const id = `${h}_${t.id}`;
      if (a < 0.05 * full) slivers[id] = { h, r: t.id };
      else pieces[id] = { h, r: t.id, a, g: g.geometry };
    }
  }
  // sliver → largest neighbouring piece of the same region (its POIs/roads are merged there)
  const merge = {};
  for (const [id, sv] of Object.entries(slivers)) {
    const nb = gridDisk(sv.h, 1).map((n) => pieces[`${n}_${sv.r}`] && `${n}_${sv.r}`).filter(Boolean).sort((x, y) => pieces[y].a - pieces[x].a);
    if (nb.length) merge[id] = nb[0];
  }
  cache = { pieces, merge };
  fs.mkdirSync("data/raw/hexes", { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache));
}
const PIECES = cache.pieces, MERGE = cache.merge;
const stats = new Map();
/** stats bucket of the piece containing a point that lies in region `rid` (slivers redirect to their neighbour) */
const cell = (h, rid) => {
  let id = `${h}_${rid}`;
  if (!PIECES[id]) id = MERGE[id];
  if (!id) return null;
  if (!stats.has(id)) stats.set(id, { p: new Array(CATS.length).fill(0), road: 0, paved: 0, unpaved: 0, stops: 0 });
  return stats.get(id);
};
// metro: every official exit (opendata.az, Bakı Metropoliteni) → walking distance is to the NEAREST EXIT
const metro = JSON.parse(fs.readFileSync("data/processed/metro-official.json", "utf8")).stations.flatMap((st) => st.exits.map((ll) => ({ ll, name: st.name })));
const stops = [], schools = [], kgs = [], parks = [];
for await (const f of seq(`${O}/pois.geojsonseq`)) {
  const [lon, lat] = rep(f.geometry);
  const reg0 = inBox(lon, lat) ? locate(lon, lat) : null;
  if (!reg0) continue;
  const t = f.properties;
  const h = latLngToCell(lat, lon, RES);
  const c = cell(h, reg0.id) ?? { p: [], stops: 0 };
  for (const k of cats(t)) if (c.p.length) c.p[CATS.indexOf(k)]++;
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
  const reg1 = inBox(lon, lat) ? locate(lon, lat) : null;
  if (!reg1) continue;
  const c = cell(latLngToCell(lat, lon, RES), reg1.id);
  if (!c) continue;
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
const EMPTY = { p: new Array(CATS.length).fill(0), road: 0, paved: 0, unpaved: 0, stops: 0 };
const listingHex = fs.existsSync("data/processed/listings-agg.json") ? JSON.parse(fs.readFileSync("data/processed/listings-agg.json", "utf8")).hexes : {};
const biggest = {};
for (const [id, pc] of Object.entries(PIECES)) if (!biggest[pc.h] || PIECES[biggest[pc.h]].a < pc.a) biggest[pc.h] = id;
const round = (co) => (typeof co[0] === "number" ? [+co[0].toFixed(5), +co[1].toFixed(5)] : co.map(round));
for (const [id, pc] of Object.entries(PIECES)) {
  const c = stats.get(id) ?? EMPTY;
  const reg = targets.find((t) => t.id === pc.r);
  // representative point of the clipped piece (centroid, or a vertex-free fallback if it falls outside)
  let [lon, lat] = turfCentroid({ type: "Feature", properties: {}, geometry: pc.g }).geometry.coordinates;
  if (!pip(point([lon, lat]), { type: "Feature", properties: {}, geometry: pc.g })) [lon, lat] = (pc.g.type === "Polygon" ? pc.g.coordinates[0] : pc.g.coordinates[0][0])[0];
  const h = id;
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
    a: Math.round(pc.a / 1000) / 1000, // km²
    ...(listingHex[pc.h] && biggest[pc.h] === id ? { pm: listingHex[pc.h].median, pn: listingHex[pc.h].n } : {}),
  });
  features.push({ type: "Feature", properties: { id: h, r: reg.id }, geometry: { type: pc.g.type, coordinates: round(pc.g.coordinates) } });
}
fs.writeFileSync("public/data/hexes.json", JSON.stringify({ res: RES, cats: CATS, hexes }));
fs.writeFileSync("public/data/hexes-geo.json", JSON.stringify({ type: "FeatureCollection", features }));
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
const byReg = hexes.reduce((o, x) => ((o[x.r] = (o[x.r] || 0) + 1), o), {});
console.log(`pieces: ${hexes.length} in ${Object.keys(byReg).length} regions, slivers merged ${Object.keys(MERGE).length}; ${kb("public/data/hexes.json")} KB + geo ${kb("public/data/hexes-geo.json")} KB; area min/max ${Math.min(...hexes.map((x) => x.a))}/${Math.max(...hexes.map((x) => x.a))} km²`);
