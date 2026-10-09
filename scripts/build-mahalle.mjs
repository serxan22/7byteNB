// Organic neighbourhood (məhəllə) polygons for Baku districts, Sumqayıt and Gəncə.
// 1) real OSM place=suburb|neighbourhood|quarter polygons, clipped to their district (no overlaps)
// 2) gaps filled with Voronoi cells seeded by OSM place nodes + validated metro stations, clipped to the district
//    (districts are already land-clipped, so cells never reach the sea or cross a district border)
// 4) cells < 0.15 km² merged into a touching neighbour; Voronoi cells > 6 km² split with seeds from hex centroids
// 5) stats aggregated from the H3 pieces (hexes stay the compute grid): sums for counts, area-weighted means for
//    distances/shares, median for prices. Step 3 (snapping edges to roads/rail) is not implemented (time box).
// Cache: data/raw/mahalle/cells.json. Out: public/data/mahalle.json (same record shape as hexes.json),
// public/data/mahalle-geo.json, data/processed/hex-to-mahalle.json
import fs from "node:fs";
import readline from "node:readline";
import turfArea from "@turf/area";
import turfBbox from "@turf/bbox";
import turfCentroid from "@turf/centroid";
import turfIntersect from "@turf/intersect";
import turfDifference from "@turf/difference";
import turfUnion from "@turf/union";
import turfSimplify from "@turf/simplify";
import turfVoronoi from "@turf/voronoi";
import pip from "@turf/boolean-point-in-polygon";
import { point, featureCollection } from "@turf/helpers";

const P = "data/raw/mahalle";
const km2 = (f) => turfArea(f) / 1e6;
const F = (geometry, properties = {}) => ({ type: "Feature", properties, geometry });
const dist = (a, b) => Math.hypot((a[0] - b[0]) * 85000, (a[1] - b[1]) * 111000); // metres, ~40°N
async function* seq(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) if (line.length > 2) yield JSON.parse(line.replace(/^\x1e/, ""));
}
const parts = (f) => (!f ? [] : f.geometry.type === "Polygon" ? [f] : f.geometry.coordinates.map((c) => F({ type: "Polygon", coordinates: c })));
const safe = (fn) => { try { return fn(); } catch { return null; } };

// districts (union of all features per id)
const feats = [...JSON.parse(fs.readFileSync("public/data/regions-baku.geojson", "utf8")).features, ...JSON.parse(fs.readFileSync("public/data/regions-az.geojson", "utf8")).features.filter((f) => ["az-sumqayit", "az-gence"].includes(f.properties.id))];
const byId = {};
for (const f of feats) (byId[f.properties.id] ||= { id: f.properties.id, name: f.properties.name, fs: [] }).fs.push(f);
const districts = Object.values(byId).map((d) => ({ ...d, g: d.fs.length === 1 ? d.fs[0] : turfUnion(featureCollection(d.fs)) }));
for (const d of districts) d.b = turfBbox(d.g);
// split threshold follows population density: dense urban districts get ~1.5 km² neighbourhoods, suburbs ~3, rural 6
const dens = Object.fromEntries([...JSON.parse(fs.readFileSync("public/data/regions-baku.json", "utf8")), ...JSON.parse(fs.readFileSync("public/data/regions-az.json", "utf8"))].map((r) => [r.id, r.density.v ?? 0]));
const splitAt = (id) => (dens[id] > 8000 ? 1.5 : dens[id] > 2000 ? 3 : 6);
const inDistrict = (ll) => districts.find((d) => ll[0] >= d.b[0] && ll[0] <= d.b[2] && ll[1] >= d.b[1] && ll[1] <= d.b[3] && pip(point(ll), d.g));

// seeds: place nodes + validated metro stations
const METRO = JSON.parse(fs.readFileSync("data/manual/metro-stations.json", "utf8"));
const seeds = [];
for await (const f of seq("data/raw/osm/places.geojsonseq")) {
  const p = f.properties;
  if (!["suburb", "neighbourhood", "quarter", "village", "hamlet", "town"].includes(p.place)) continue;
  const name = p["name:az"] || p.name;
  if (name && !/[԰-֏؀-ۿ]/.test(name)) seeds.push({ ll: f.geometry.coordinates, name, kind: "place" });
}
const hexData = JSON.parse(fs.readFileSync("public/data/hexes.json", "utf8"));
const metroPts = new Map();
for (const h of hexData.hexes) if (h.mn && h.m != null && h.m < 120) metroPts.set(h.mn, h.c); // hex next to the station
for await (const f of seq("data/raw/osm/pois.geojsonseq")) {
  const t = f.properties;
  if (t.station !== "subway" || f.geometry.type !== "Point") continue;
  const n = (t["name:az"] || t.name || "").replace(/ metro stansiyası| m\/s/i, "").trim();
  const name = METRO.aliases[n] ?? n;
  if (METRO.stations.includes(name)) metroPts.set(name, f.geometry.coordinates);
}
for (const [name, ll] of metroPts) seeds.push({ ll, name: `${name} m. ətrafı`, kind: "metro" });

let cells;
if (fs.existsSync(`${P}/cells.json`)) cells = JSON.parse(fs.readFileSync(`${P}/cells.json`, "utf8"));
else {
  cells = [];
  // ---- 1. real OSM neighbourhood polygons (smallest first so the more specific one wins) ----
  const real = [];
  for await (const f of seq(`${P}/place-polys.geojsonseq`)) {
    const name = f.properties["name:az"] || f.properties.name;
    if (!name || /[԰-֏؀-ۿ]/.test(name)) continue;
    const d = inDistrict(turfCentroid(f).geometry.coordinates);
    if (d) real.push({ f, name, d, a: km2(f) });
  }
  real.sort((a, b) => a.a - b.a);
  const taken = {};
  for (const r of real) {
    let g = safe(() => turfIntersect(featureCollection([r.f, r.d.g])));
    if (g && taken[r.d.id]) g = safe(() => turfDifference(featureCollection([g, taken[r.d.id]])));
    if (!g || km2(g) < 0.02) continue;
    taken[r.d.id] = taken[r.d.id] ? safe(() => turfUnion(featureCollection([taken[r.d.id], g]))) ?? taken[r.d.id] : g;
    cells.push({ g: g.geometry, r: r.d.id, name: r.name, src: "osm" });
  }
  // ---- 2. Voronoi fill of the remaining gap in every district ----
  for (const d of districts) {
    const gap = taken[d.id] ? safe(() => turfDifference(featureCollection([d.g, taken[d.id]]))) : d.g;
    if (!gap || km2(gap) < 0.05) continue;
    const ss = [];
    for (const s of seeds) {
      if (!pip(point(s.ll), gap)) continue;
      if (ss.some((x) => dist(x.ll, s.ll) < 200)) continue; // dedupe near-identical seeds
      ss.push(s);
    }
    const voronoiFill = (area, sd) => {
      if (sd.length < 2) return [{ g: area, seed: sd[0] }];
      const b = turfBbox(area);
      const vor = turfVoronoi(featureCollection(sd.map((s) => point(s.ll, { i: sd.indexOf(s) }))), { bbox: [b[0] - 0.05, b[1] - 0.05, b[2] + 0.05, b[3] + 0.05] });
      const out = [];
      vor.features.forEach((c, i) => {
        if (!c) return;
        const g = safe(() => turfIntersect(featureCollection([c, area])));
        for (const pc of parts(g)) out.push({ g: pc, seed: sd[i] });
      });
      return out;
    };
    let pieces = ss.length ? voronoiFill(gap, ss) : parts(gap).map((g) => ({ g, seed: null }));
    // ---- 4b. split big Voronoi cells (> 6 km²) with seeds from hex centroids (farthest-point sampling) ----
    const out = [];
    for (const pc of pieces) {
      const a = km2(pc.g);
      const lim = splitAt(d.id);
      if (a <= lim) { out.push(pc); continue; }
      const cand = hexData.hexes.filter((h) => h.r === d.id && pip(point(h.c), pc.g)).map((h) => h.c);
      const k = Math.min(cand.length, Math.ceil(a / (lim / 2)));
      if (k < 2) { out.push(pc); continue; }
      const pick = [pc.seed && pip(point(pc.seed.ll), pc.g) ? pc.seed.ll : cand[0]];
      while (pick.length < k) {
        let best = null, bd = -1;
        for (const c of cand) { const m = Math.min(...pick.map((p) => dist(p, c))); if (m > bd) { bd = m; best = c; } }
        pick.push(best);
      }
      const sub = voronoiFill(pc.g, pick.map((ll, i) => ({ ll, name: i === 0 ? pc.seed?.name : null, kind: "hex" })));
      out.push(...sub);
    }
    for (const pc of out) cells.push({ g: pc.g.geometry, r: d.id, name: pc.seed?.name ?? null, src: "voronoi" });
  }
  // ---- 4a. merge cells < 0.15 km² into a touching neighbour of the same district ----
  cells = cells.filter((c) => km2(F(c.g)) >= 0.01); // zero-area clipping slivers
  let merged = true;
  while (merged) {
    merged = false;
    cells.sort((a, b) => km2(F(a.g)) - km2(F(b.g)));
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (km2(F(c.g)) >= 0.15) break;
      const cc = turfCentroid(F(c.g)).geometry.coordinates;
      const nb = cells.map((x, j) => ({ x, j })).filter(({ x, j }) => j !== i && x.r === c.r).sort((a, b) => dist(turfCentroid(F(a.x.g)).geometry.coordinates, cc) - dist(turfCentroid(F(b.x.g)).geometry.coordinates, cc)).slice(0, 8);
      for (const { x, j } of nb) {
        const u = safe(() => turfUnion(featureCollection([F(x.g), F(c.g)])));
        if (u && u.geometry.type === "Polygon") {
          cells[j] = { ...x, g: u.geometry };
          cells.splice(i, 1);
          merged = true;
          break;
        }
      }
      if (!merged && nb.length) {
        // no touching neighbour (isolated fragment): attach to the nearest cell of the same district
        const { x, j } = nb[0];
        const u = safe(() => turfUnion(featureCollection([F(x.g), F(c.g)])));
        if (u) { cells[j] = { ...x, g: u.geometry }; cells.splice(i, 1); merged = true; }
      }
      if (merged) break;
    }
  }
  fs.writeFileSync(`${P}/cells.json`, JSON.stringify(cells));
}

// ---- 5. aggregate hex stats into mahalle ----
const round = (co) => (typeof co[0] === "number" ? [+co[0].toFixed(5), +co[1].toFixed(5)] : co.map(round));
const geoms = cells.map((c, i) => {
  const s = turfSimplify(F(c.g), { tolerance: 0.00012, highQuality: false });
  return { ...c, i, f: F(s.geometry), b: turfBbox(s), cent: turfCentroid(F(c.g)).geometry.coordinates, a: km2(F(c.g)) };
});
const assign = {};
const members = geoms.map(() => []);
for (const h of hexData.hexes) {
  let gi = geoms.findIndex((g) => g.r === h.r && h.c[0] >= g.b[0] && h.c[0] <= g.b[2] && h.c[1] >= g.b[1] && h.c[1] <= g.b[3] && pip(point(h.c), g.f));
  if (gi < 0) gi = geoms.map((g, j) => ({ j, d: g.r === h.r ? dist(g.cent, h.c) : Infinity })).sort((a, b) => a.d - b.d)[0].j;
  members[gi].push(h);
}
const usedLabels = {};
const recs = [], features = [];
geoms.forEach((g, gi) => {
  const hs = members[gi];
  const id = `mh-${g.r}-${gi}`;
  for (const h of hs) assign[h.h] = id;
  const W = hs.reduce((s, h) => s + (h.a ?? 0.7), 0) || 1;
  const wmean = (k) => { const v = hs.filter((h) => h[k] != null); const w = v.reduce((s, h) => s + (h.a ?? 0.7), 0); return w ? Math.round(v.reduce((s, h) => s + h[k] * (h.a ?? 0.7), 0) / w) : null; };
  const near = hs.filter((h) => h.mn && h.m != null).sort((a, b) => a.m - b.m)[0];
  const pms = hs.filter((h) => h.pm).map((h) => h.pm).sort((a, b) => a - b);
  const dname = districts.find((d) => d.id === g.r).name;
  // label: OSM name → nearest place node within 2.5 km → nearest metro
  let base = g.name;
  if (!base) {
    const np = seeds.filter((s) => s.kind === "place").map((s) => ({ s, d: dist(s.ll, g.cent) })).sort((a, b) => a.d - b.d)[0];
    base = np && np.d < 2500 ? np.s.name : near ? `${near.mn} m. ətrafı` : np ? `${np.s.name} yaxınlığı` : "mərkəz";
  }
  let label = `${dname} · ${base}`;
  usedLabels[label] = (usedLabels[label] ?? 0) + 1;
  if (usedLabels[label] > 1) label = `${label} ${usedLabels[label]}`;
  recs.push({
    h: id,
    c: [+g.cent[0].toFixed(5), +g.cent[1].toFixed(5)],
    r: g.r,
    l: label,
    src: g.src,
    p: hexData.cats.map((_, ci) => hs.reduce((s, h) => s + (h.p[ci] ?? 0), 0)),
    st: hs.reduce((s, h) => s + h.st, 0),
    m: wmean("m"),
    mn: near?.mn ?? null,
    s: wmean("s"),
    sc: wmean("sc"),
    k: wmean("k"),
    pk: wmean("pk"),
    rk: +hs.reduce((s, h) => s + h.rk, 0).toFixed(2),
    pv: wmean("pv"),
    a: +g.a.toFixed(3),
    ...(pms.length ? { pm: pms[Math.floor(pms.length / 2)], pn: hs.reduce((s, h) => s + (h.pn ?? 0), 0) } : {}),
    nh: hs.length,
  });
  features.push(F({ type: g.f.geometry.type, coordinates: round(g.f.geometry.coordinates) }, { id, r: g.r }));
  void W;
});
fs.writeFileSync("public/data/mahalle.json", JSON.stringify({ res: null, kind: "mahalle", cats: hexData.cats, hexes: recs }));
fs.writeFileSync("public/data/mahalle-geo.json", JSON.stringify({ type: "FeatureCollection", features }));
fs.writeFileSync("data/processed/hex-to-mahalle.json", JSON.stringify(assign));
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0);
console.log(`mahalle: ${recs.length} (osm ${recs.filter((r) => r.src === "osm").length}, voronoi ${recs.filter((r) => r.src === "voronoi").length}); area min/max ${Math.min(...recs.map((r) => r.a))}/${Math.max(...recs.map((r) => r.a))} km²; ${kb("public/data/mahalle.json")} KB + geo ${kb("public/data/mahalle-geo.json")} KB; nərimanov ${recs.filter((r) => r.r === "bk-nerimanov").length}`);
