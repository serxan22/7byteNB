// Turns the osmium GeoJSONSeq extracts into per-region OSM metrics + simplified geometry.
// In:  data/raw/osm/*.geojsonseq, routes.opl, data/processed/population.json
// Out: data/processed/osm-regions.json, data/processed/regions-geo.json,
//      public/data/regions-az.geojson, public/data/regions-baku.geojson, public/data/pois-baku.json
import fs from "node:fs";
import readline from "node:readline";
import turfArea from "@turf/area";
import turfBbox from "@turf/bbox";
import turfCentroid from "@turf/centroid";
import turfSimplify from "@turf/simplify";
import turfLength from "@turf/length";
import pip from "@turf/boolean-point-in-polygon";
import { point, polygon, featureCollection } from "@turf/helpers";
import turfDifference from "@turf/difference";
import turfIntersect from "@turf/intersect";
import turfUnion from "@turf/union";

const O = "data/raw/osm";
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

export const slug = (s) =>
  s
    .toLocaleLowerCase("az")
    .replace(/ə/g, "e").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ç/g, "c")
    .replace(/ö/g, "o").replace(/ü/g, "u").replace(/ğ/g, "g")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const base = (s) => s.replace(/\s+(rayonu|Rayonu|şəhəri|İnzibati Ərazisi)$/u, "").trim();

async function* seq(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) if (line.length > 2) yield JSON.parse(line.replace(/^\x1e/, ""));
  // locally repaired relations that osmium could not assemble (see scripts/fix-qazax.mjs)
  if (file.endsWith("boundaries.geojsonseq") && fs.existsSync(`${O}/qazax.geojson`)) yield JSON.parse(fs.readFileSync(`${O}/qazax.geojson`, "utf8"));
}

// ---------- 1. Boundaries ----------
const pop = JSON.parse(fs.readFileSync("data/processed/population.json", "utf8")).rows;
const dskUnits = pop.filter((r) => r.kind === "unit");
const dskAz = new Map(dskUnits.filter((r) => r.group !== "Bakı şəhəri").map((r) => [slug(base(r.name)), r]));
const dskBaku = new Map(dskUnits.filter((r) => r.group === "Bakı şəhəri").map((r) => [slug(base(r.name)), r]));
const BAKU_DISTRICTS = [...dskBaku.keys()];

const azFeats = new Map(); // id -> {name, polys[]}
const bkFeats = new Map();
for await (const f of seq(`${O}/boundaries.geojsonseq`)) {
  const p = f.properties;
  const name = p["name:az"] || p.name;
  if (!name || !/^(Polygon|MultiPolygon)$/.test(f.geometry.type)) continue;
  const key = slug(base(name));
  const c = turfCentroid(f).geometry.coordinates;
  const inBakuBox = c[0] > 49.4 && c[0] < 51.0 && c[1] > 39.9 && c[1] < 40.7;
  if (BAKU_DISTRICTS.includes(key) && inBakuBox && /rayonu$/.test(name) && ["6", "7", "8"].includes(p.admin_level)) {
    const id = `bk-${key}`;
    if (!bkFeats.has(id)) bkFeats.set(id, { id, name: base(name), dsk: dskBaku.get(key), polys: [f] });
    continue;
  }
  if (p.admin_level !== "6") continue;
  if (key === "baki") continue; // OSM "Bakı" level-6 polygon is only the core; Baku = union of its 12 districts
  const d = dskAz.get(key);
  if (!d) continue; // foreign or Baku-internal (e.g. Qaradağ at level 6 handled above)
  const id = `az-${key}`;
  const e = azFeats.get(id);
  if (e) e.polys.push(f); // e.g. "Şəki İnzibati Ərazisi" merges into Şəki rayonu (DSK counts them together)
  else azFeats.set(id, { id, name: base(d.name), dsk: d, polys: [f] });
}
log(`AZ regions: ${azFeats.size}/${dskAz.size + 1}, Baku districts: ${bkFeats.size}/12`);
const missingAz = [...dskAz.keys()].filter((k) => !azFeats.has(`az-${k}`));
if (missingAz.length) log("missing AZ:", missingAz.join(", "));
const missingBk = BAKU_DISTRICTS.filter((k) => !bkFeats.has(`bk-${k}`));
if (missingBk.length) log("missing Baku:", missingBk.join(", "));

// ---------- 1b. Clip administrative polygons to land (Caspian = largest closed coastline ring) ----------
{
  const rings = [];
  for await (const f of seq(`${O}/coastline.geojsonseq`)) rings.push(f.geometry.coordinates);
  const key = (p) => p.join();
  let segs = rings.filter((c) => key(c[0]) !== key(c.at(-1)));
  const closed = rings.filter((c) => key(c[0]) === key(c.at(-1)));
  while (segs.length) {
    let ch = segs.shift(), g = true;
    while (g) {
      g = false;
      for (let i = 0; i < segs.length; i++) {
        const s2 = segs[i];
        if (key(s2[0]) === key(ch.at(-1))) { ch = ch.concat(s2.slice(1)); segs.splice(i, 1); g = true; break; }
        if (key(s2.at(-1)) === key(ch[0])) { ch = s2.concat(ch.slice(1)); segs.splice(i, 1); g = true; break; }
      }
    }
    if (key(ch[0]) === key(ch.at(-1))) closed.push(ch);
  }
  closed.sort((a, b) => b.length - a.length);
  const sea = turfSimplify(polygon([closed[0]]), { tolerance: 0.0005 });
  const seaBox = turfBbox(sea);
  const islands = closed.slice(1).filter((c) => c.length >= 4).map((c) => polygon([c]));
  let clipped = 0;
  const clip = (f) => {
    const b = turfBbox(f);
    if (b[2] < seaBox[0] || b[0] > seaBox[2] || b[3] < seaBox[1] || b[1] > seaBox[3]) return [f];
    try {
      const a0 = turfArea(f);
      const land = turfDifference(featureCollection([f, sea]));
      const parts = land ? [land] : [];
      for (const isl of islands) {
        const ib = turfBbox(isl);
        if (ib[2] < b[0] || ib[0] > b[2] || ib[3] < b[1] || ib[1] > b[3]) continue;
        const x = turfIntersect(featureCollection([f, isl]));
        if (x) parts.push(x);
      }
      const a1 = parts.reduce((s2, p) => s2 + turfArea(p), 0);
      if (!parts.length || a1 > a0 * 0.99) return [f];
      clipped++;
      return parts.map((p) => ({ ...p, properties: f.properties }));
    } catch (e) {
      log("clip failed", f.properties.name, e.message);
      return [f];
    }
  };
  for (const m of [azFeats, bkFeats]) for (const r of m.values()) r.polys = r.polys.flatMap(clip);
  log(`clipped ${clipped} polygons to land (${islands.length} island rings)`);
  // Baku (country level) = union of its districts
  const all = [...bkFeats.values()].flatMap((r) => r.polys);
  let u = all[0];
  try { u = turfUnion(featureCollection(all)); } catch (e) { log("union failed", e.message); }
  azFeats.set("az-baki", { id: "az-baki", name: "Bakı", dsk: pop.find((r) => r.name === "Bakı şəhəri"), polys: u === all[0] ? all : [u] });
}

const regions = [];
for (const [level, m] of [["rayon", azFeats], ["baku_district", bkFeats]]) {
  for (const r of m.values()) {
    const bboxes = r.polys.map((f) => turfBbox(f));
    const bbox = [Math.min(...bboxes.map((b) => b[0])), Math.min(...bboxes.map((b) => b[1])), Math.max(...bboxes.map((b) => b[2])), Math.max(...bboxes.map((b) => b[3]))];
    const area = r.polys.reduce((s, f) => s + turfArea(f), 0) / 1e6;
    const main = r.polys.reduce((a, b) => (turfArea(a) > turfArea(b) ? a : b));
    regions.push({ id: r.id, name: r.name, level, dsk: r.dsk, polys: r.polys, bbox, bboxes, area_km2: Math.round(area * 10) / 10, centroid: turfCentroid(main).geometry.coordinates.map((x) => +x.toFixed(4)) });
  }
}
const inside = (r, lon, lat) => {
  if (lon < r.bbox[0] || lon > r.bbox[2] || lat < r.bbox[1] || lat > r.bbox[3]) return false;
  const pt = point([lon, lat]);
  return r.polys.some((f, i) => {
    const b = r.bboxes[i];
    return lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3] && pip(pt, f);
  });
};
const AZ = regions.filter((r) => r.level === "rayon");
const BK = regions.filter((r) => r.level === "baku_district");
const AZ_BAKI = AZ.find((r) => r.id === "az-baki");
const AZ_REST = AZ.filter((r) => r.id !== "az-baki");
const locate = (lon, lat) => {
  const b = BK.find((r) => inside(r, lon, lat));
  if (b) return [AZ_BAKI, b];
  const a = AZ_REST.find((r) => inside(r, lon, lat));
  return a ? [a] : [];
};
for (const r of regions) {
  r.pois = {};
  r.transport = { metro: 0, rail: 0, bus_stops: 0, bus_routes: 0, metroNames: new Set(), railNames: new Set(), routes: new Set(), refs: new Set() };
  r.roads = { total: 0, paved: 0, unpaved: 0, unknown: 0 };
}

// ---------- 2. POIs ----------
const CATS = ["pharmacy", "grocery", "mall", "bazaar", "food", "school", "kindergarten", "university", "hospital", "clinic", "bank_atm", "fuel", "sport", "park"];
function cats(t) {
  const c = [];
  const a = t.amenity, s = t.shop, l = t.leisure;
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
const repPoint = (g) => {
  if (g.type === "Point") return g.coordinates;
  const b = turfBbox(g);
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
};
const bakuPois = [];
const metroPts = [];
const parkPolys = [];
for await (const f of seq(`${O}/pois.geojsonseq`)) {
  const t = f.properties;
  const [lon, lat] = repPoint(f.geometry);
  const hit = locate(lon, lat);
  if (!hit.length) continue;
  const cs = cats(t);
  const isMetro = t.station === "subway";
  const isRail = !isMetro && t.railway === "station" && t.station !== "light_rail";
  const isStop = t.highway === "bus_stop";
  if (isMetro) metroPts.push([lon, lat]);
  if (cs.includes("park") && /Polygon/.test(f.geometry.type)) parkPolys.push(f);
  for (const r of hit) {
    for (const c of cs) r.pois[c] = (r.pois[c] ?? 0) + 1;
    if (isMetro) r.transport.metroNames.add(t.name || `${lon.toFixed(3)},${lat.toFixed(3)}`);
    if (isRail) r.transport.railNames.add(t.name || `${lon.toFixed(2)},${lat.toFixed(2)}`);
    if (isStop) r.transport.bus_stops++;
  }
  if (hit[0].id === "az-baki") {
    const ci = isMetro ? CATS.length : isStop ? CATS.length + 1 : CATS.indexOf(cs[0]);
    if (ci >= 0) bakuPois.push([+lon.toFixed(4), +lat.toFixed(4), ci]);
  }
}
log(`POIs done; baku dots ${bakuPois.length}, metro pts ${metroPts.length}`);

// ---------- 3. Routes (OPL) ----------
const dec = (s) => s.replace(/%([0-9a-f]+)%/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
const nodes = new Map(), ways = new Map(), rels = [];
for (const line of fs.readFileSync(`${O}/routes.opl`, "utf8").split("\n")) {
  if (!line) continue;
  const parts = line.split(" ");
  const id = parts[0];
  const field = (ch) => parts.find((p) => p[0] === ch)?.slice(1) ?? "";
  if (id[0] === "n") {
    const x = parseFloat(field("x")), y = parseFloat(field("y"));
    if (!isNaN(x)) nodes.set(id, [x, y]);
  } else if (id[0] === "w") ways.set(id, field("N").split(",").filter(Boolean));
  else if (id[0] === "r") {
    const tags = Object.fromEntries(field("T").split(",").filter(Boolean).map((kv) => { const i = kv.indexOf("="); return [dec(kv.slice(0, i)), dec(kv.slice(i + 1))]; }));
    const members = field("M").split(",").filter(Boolean).map((m) => m.split("@")[0]);
    rels.push({ id, tags, members });
  }
}
for (const rel of rels) {
  const pts = [];
  for (const m of rel.members) {
    if (m[0] === "n" && nodes.has(m)) pts.push(nodes.get(m));
    if (m[0] === "w" && ways.has(m)) {
      const ns = ways.get(m);
      for (const n of [ns[0], ns[Math.floor(ns.length / 2)]]) if (nodes.has(n)) pts.push(nodes.get(n));
    }
  }
  const touched = new Set();
  for (const [lon, lat] of pts) for (const r of locate(lon, lat)) touched.add(r);
  const ref = rel.tags.ref || rel.tags.name || rel.id;
  for (const r of touched) {
    r.transport.routes.add(ref);
    if (rel.tags.ref) r.transport.refs.add(rel.tags.ref);
  }
}
log(`routes: ${rels.length} relations`);

// ---------- 4. Roads ----------
const PAVED = new Set(["asphalt", "concrete", "paved", "paving_stones", "concrete:plates", "sett", "chipseal"]);
const UNPAVED = new Set(["unpaved", "dirt", "ground", "gravel", "compacted", "sand", "grass", "fine_gravel", "earth", "mud", "pebblestone"]);
let nRoads = 0;
for await (const f of seq(`${O}/roads.geojsonseq`)) {
  const c = f.geometry.coordinates;
  const [lon, lat] = c[Math.floor(c.length / 2)];
  const hit = locate(lon, lat);
  if (!hit.length) continue;
  const km = turfLength(f);
  const s = f.properties.surface;
  const cls = s ? (PAVED.has(s) ? "paved" : UNPAVED.has(s) ? "unpaved" : "unknown") : f.properties.highway === "track" ? "unpaved" : "unknown";
  for (const r of hit) {
    r.roads.total += km;
    r.roads[cls] += km;
  }
  nRoads++;
}
log(`roads: ${nRoads}`);

// ---------- 5. Land cover (sampled grid, spatial index) ----------
const LC_CLASS = (t) => {
  const lu = t.landuse, n = t.natural;
  if (n === "water" || n === "wetland") return "water";
  if (lu === "forest" || n === "wood") return "forest";
  if (n === "beach" || n === "sand") return "beach";
  if (lu === "residential") return "residential";
  if (lu === "industrial") return "industrial";
  if (["farmland", "orchard", "vineyard", "farmyard"].includes(lu)) return "farmland";
  if (["meadow", "grass"].includes(lu) || ["scrub", "grassland", "heath"].includes(n)) return "grass";
  return null;
};
const PRIORITY = ["water", "park", "forest", "beach", "industrial", "residential", "farmland", "grass"];
const CELL = 0.05;
const grid = new Map();
const lcPolys = [];
const addPoly = (f, cls) => {
  const b = turfBbox(f);
  const idx = lcPolys.push({ f, cls, b }) - 1;
  for (let x = Math.floor(b[0] / CELL); x <= Math.floor(b[2] / CELL); x++)
    for (let y = Math.floor(b[1] / CELL); y <= Math.floor(b[3] / CELL); y++) {
      const k = `${x}:${y}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(idx);
    }
};
for await (const f of seq(`${O}/landcover.geojsonseq`)) {
  const cls = LC_CLASS(f.properties);
  if (cls) addPoly(f, cls);
}
for (const f of parkPolys) addPoly(f, "park");
log(`landcover polys indexed: ${lcPolys.length}`);
const classAt = (lon, lat) => {
  const cand = grid.get(`${Math.floor(lon / CELL)}:${Math.floor(lat / CELL)}`) ?? [];
  let best = null;
  const pt = point([lon, lat]);
  for (const i of cand) {
    const { f, cls, b } = lcPolys[i];
    if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
    if (best && PRIORITY.indexOf(cls) >= PRIORITY.indexOf(best)) continue;
    try {
      if (pip(pt, f)) best = cls;
    } catch {}
  }
  return best;
};

// Coastline vertices
const coast = [];
for await (const f of seq(`${O}/coastline.geojsonseq`)) for (const c of f.geometry.coordinates) coast.push(c);
const kmDist = (a, b) => {
  const dx = (a[0] - b[0]) * 111.32 * Math.cos((a[1] * Math.PI) / 180), dy = (a[1] - b[1]) * 110.57;
  return Math.hypot(dx, dy);
};

const geoOut = [];
for (const r of regions) {
  const N = r.level === "rayon" ? 36 : 30;
  const [x0, y0, x1, y1] = r.bbox;
  const samples = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const lon = x0 + ((i + 0.5) / N) * (x1 - x0), lat = y0 + ((j + 0.5) / N) * (y1 - y0);
    if (inside(r, lon, lat)) samples.push([lon, lat]);
  }
  const counts = {};
  for (const [lon, lat] of samples) {
    const c = classAt(lon, lat);
    if (c) counts[c] = (counts[c] ?? 0) + 1;
  }
  r.landcover = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round((v / Math.max(1, samples.length)) * 1000) / 10]));
  // coastal: any inside sample within 3 km of coastline, or centroid within 5 km
  const near = coast.filter((c) => c[0] > x0 - 0.1 && c[0] < x1 + 0.1 && c[1] > y0 - 0.1 && c[1] < y1 + 0.1);
  r.coastal = near.length > 0 && (near.some((c) => kmDist(c, r.centroid) < (r.level === "rayon" ? 5 : 1.5)) || samples.some((s) => near.some((c) => kmDist(c, s) < (r.level === "rayon" ? 1.5 : 0.6))));
  // 5×5 grid for elevation
  const g5 = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const lon = x0 + ((i + 0.5) / 5) * (x1 - x0), lat = y0 + ((j + 0.5) / 5) * (y1 - y0);
    if (inside(r, lon, lat)) g5.push([+lon.toFixed(4), +lat.toFixed(4)]);
  }
  if (g5.length < 3) g5.push(...samples.filter((_, k) => k % Math.max(1, Math.floor(samples.length / 6)) === 0).slice(0, 6).map((s) => s.map((x) => +x.toFixed(4))));
  if (!g5.length) g5.push(r.centroid);
  geoOut.push({ id: r.id, level: r.level, name: r.name, centroid: r.centroid, grid: g5 });
}
log("landcover + coastal done");

// ---------- 6. Write outputs ----------
const pct = (x, t) => (t > 0 ? Math.round((x / t) * 1000) / 10 : null);
const out = regions.map((r) => {
  const nearest = r.level === "baku_district" && metroPts.length ? Math.round(Math.min(...metroPts.map((m) => kmDist(m, r.centroid))) * 10) / 10 : null;
  return {
    id: r.id,
    name: r.name,
    level: r.level,
    parent_id: r.level === "baku_district" ? "az-baki" : undefined,
    centroid: r.centroid,
    area_km2: r.area_km2,
    dsk: r.dsk ? { name: r.dsk.name, pop: r.dsk.pop, density: r.dsk.density, area_km2: r.dsk.area_km2 } : null,
    pois: Object.fromEntries(CATS.map((c) => [c, r.pois[c] ?? 0])),
    transport: {
      metro: r.transport.metroNames.size,
      rail: r.transport.railNames.size,
      bus_stops: r.transport.bus_stops,
      bus_routes: r.transport.routes.size,
      nearest_metro_km: nearest,
      route_refs: r.level === "baku_district" ? [...r.transport.refs].sort((a, b) => (parseInt(a) || 999) - (parseInt(b) || 999)).slice(0, 60) : undefined,
    },
    roads: { total_km: Math.round(r.roads.total), paved_pct: pct(r.roads.paved, r.roads.total), unpaved_pct: pct(r.roads.unpaved, r.roads.total), unknown_pct: pct(r.roads.unknown, r.roads.total) },
    landcover: r.landcover,
    coastal: r.coastal,
  };
});
fs.writeFileSync("data/processed/osm-regions.json", JSON.stringify(out));
fs.writeFileSync("data/processed/regions-geo.json", JSON.stringify(geoOut));

const round = (coords, d) => (typeof coords[0] === "number" ? coords.map((x) => +x.toFixed(d)) : coords.map((c) => round(c, d)));
const writeGeo = (rs, file, tol, d) => {
  const features = [];
  for (const r of rs)
    for (const f of r.polys) {
      const s = turfSimplify(f, { tolerance: tol, highQuality: false });
      features.push({ type: "Feature", properties: { id: r.id, name: r.name }, geometry: { type: s.geometry.type, coordinates: round(s.geometry.coordinates, d) } });
    }
  fs.writeFileSync(file, JSON.stringify({ type: "FeatureCollection", features }));
  log(`${file}: ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
};
fs.mkdirSync("public/data", { recursive: true });
writeGeo(AZ, "public/data/regions-az.geojson", 0.004, 4);
writeGeo(BK, "public/data/regions-baku.geojson", 0.0004, 5);
fs.writeFileSync("public/data/pois-baku.json", JSON.stringify({ cats: [...CATS, "metro", "bus_stop"], pts: bakuPois }));
log(`pois-baku.json: ${(fs.statSync("public/data/pois-baku.json").size / 1024).toFixed(0)} KB`);
