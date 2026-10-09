// Joins OSM metrics + DSK population + Open-Meteo + manual prices (+ AI profiles) into public/data/*.json.
import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { computeIndices } from "../src/lib/score.ts";

const read = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d);
const osm = read("data/processed/osm-regions.json");
const meteo = read("data/processed/meteo.json", { regions: {} });
const aiProfiles = read("data/processed/ai-profiles.json", {});
const aliases = read("data/manual/name-aliases.json", {});
const popMeta = read("data/processed/population.json");

// ---------- prices ----------
const priceRows = parse(fs.readFileSync("data/manual/prices.csv", "utf8"), { columns: true, skip_empty_lines: true, trim: true });
const byName = Object.fromEntries(osm.map((r) => [r.name.toLocaleLowerCase("az"), r.id]));
const resolveId = (row) => {
  if (osm.some((r) => r.id === row.region_id)) return row.region_id;
  const n = (row.region_name || "").toLocaleLowerCase("az");
  return aliases[row.region_name] || aliases[row.region_id] || byName[n] || null;
};
const prices = {};
const priceLog = [];
for (const row of priceRows) {
  const id = resolveId(row);
  const value = row.value === "" ? null : Number(row.value);
  if (!id) { priceLog.push({ ...row, status: "unmatched" }); continue; }
  (prices[id] ||= {})[row.property_type] = {
    value: Number.isFinite(value) ? value : null,
    unit: row.unit,
    n: Number(row.n_samples) || 0,
    source: row.source,
    ...(row.source_url ? { source_url: row.source_url } : {}),
    confidence: row.confidence,
  };
  priceLog.push({ region_id: id, region_name: row.region_name, property_type: row.property_type, value, unit: row.unit, source: row.source, source_url: row.source_url, confidence: row.confidence });
}
const RANK = { official: 4, estimate: 3, sample: 2, mock: 1 };

// ---------- regions ----------
const round = (x, d = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const regions = osm.map((o) => {
  const pop = o.dsk?.pop ?? null;
  const m = meteo.regions[o.id] ?? {};
  const totalPois = Object.values(o.pois).reduce((a, b) => a + b, 0);
  const per10k = Object.fromEntries(Object.entries(o.pois).map(([k, v]) => [k, pop ? round((v / pop) * 1e4) : null]));
  per10k.bus_stops = pop ? round((o.transport.bus_stops / pop) * 1e4) : null;
  const known = (o.roads.paved_pct ?? 0) + (o.roads.unpaved_pct ?? 0);
  const ps = prices[o.id] ?? {};
  const best = Object.values(ps).filter((p) => p.value != null).reduce((b, p) => (RANK[p.confidence] > (RANK[b] ?? 0) ? p.confidence : b), null);
  return {
    id: o.id,
    name: o.name,
    level: o.level,
    ...(o.parent_id ? { parent_id: o.parent_id } : {}),
    centroid: o.centroid,
    area_km2: o.area_km2,
    population: { v: pop, badge: "official" },
    density: { v: o.dsk?.density != null ? Math.round(o.dsk.density) : null, badge: "official" },
    pois: o.pois,
    per10k,
    transport: { ...o.transport, route_refs: o.transport.route_refs ?? undefined },
    roads: { ...o.roads, paved_known_pct: known >= 10 ? round((o.roads.paved_pct / known) * 100, 1) : null },
    nature: {
      elev_mean: m.elev_mean ?? null,
      elev_min: m.elev_min ?? null,
      elev_max: m.elev_max ?? null,
      ruggedness: m.ruggedness ?? null,
      terrain: m.terrain ?? null,
      coastal: o.coastal,
      landcover: o.landcover,
    },
    climate: { july_max_c: m.july_max_c ?? null, jan_min_c: m.jan_min_c ?? null, precip_mm: m.precip_mm ?? null },
    air: { pm25: m.pm25 ?? null },
    prices: ps,
    indices: {},
    coverage: { osm: totalPois > 200 ? "yüksək" : totalPois > 40 ? "orta" : "aşağı", prices: best ?? "none" },
    ...(aiProfiles[o.id] ? { ai: aiProfiles[o.id] } : {}),
  };
});

const median = (xs) => {
  const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = Math.floor(v.length / 2);
  return v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2;
};
const national = {};
for (const level of ["rayon", "baku_district"]) {
  const rs = regions.filter((r) => r.level === level);
  const idx = computeIndices(rs);
  for (const r of rs) r.indices = idx[r.id];
  const keys = Object.keys(rs[0].per10k);
  national[level] = {
    level,
    label: level === "rayon" ? "ölkə üzrə rayon medianı" : "Bakı rayonlarının medianı",
    per10k: Object.fromEntries(keys.map((k) => [k, round(median(rs.map((r) => r.per10k[k])))])),
    indices: Object.fromEntries(Object.keys(rs[0].indices).map((k) => [k, median(rs.map((r) => r.indices[k]))])),
    prices: Object.fromEntries(["menzil_yeni", "menzil_kohne", "heyet_evi", "obyekt", "torpaq"].map((t) => [t, median(rs.map((r) => r.prices[t]?.value ?? null))])),
    density: median(rs.map((r) => r.density.v)),
    paved_pct: median(rs.map((r) => r.roads.paved_known_pct)),
    pm25: round(median(rs.map((r) => r.air.pm25)), 1),
    bus_routes: median(rs.map((r) => r.transport.bus_routes)),
  };
}

fs.mkdirSync("public/data", { recursive: true });
fs.writeFileSync("public/data/regions-az.json", JSON.stringify(regions.filter((r) => r.level === "rayon")));
fs.writeFileSync("public/data/regions-baku.json", JSON.stringify(regions.filter((r) => r.level === "baku_district")));
fs.writeFileSync("public/data/national.json", JSON.stringify(national));

// ---------- sources.json ----------
const realPrices = priceLog.filter((p) => p.confidence !== "mock" && p.value != null);
const covCount = (lvl, c) => regions.filter((r) => r.level === lvl && r.coverage.osm === c).length;
const sources = {
  generated_at: new Date().toISOString(),
  datasets: [
    { key: "osm", name: "OpenStreetMap (Geofabrik Azərbaycan çıxarışı)", url: "https://download.geofabrik.de/asia/azerbaijan-latest.osm.pbf", badge: "osm", status: "ok", date: fs.statSync("data/raw/azerbaijan-latest.osm.pbf").mtime.toISOString().slice(0, 10), coverage: `Rayonlar: ${covCount("rayon", "yüksək")} yüksək / ${covCount("rayon", "orta")} orta / ${covCount("rayon", "aşağı")} aşağı; Bakı rayonları: ${covCount("baku_district", "yüksək")} yüksək / ${covCount("baku_district", "orta")} orta`, used_for: "Sərhədlər, xidmət obyektləri (POI), dayanacaqlar, metro, marşrutlar, yollar və örtük, torpaq örtüyü, sahil xətti", license: "ODbL © OpenStreetMap contributors" },
    { key: "dsk", name: "Dövlət Statistika Komitəsi — cədvəl 1.15 (ərazi, əhali, sıxlıq)", url: popMeta?.url, badge: "official", status: popMeta ? "ok" : "unavailable", date: popMeta?.date, coverage: `${regions.filter((r) => r.population.v).length}/${regions.length} ərazi`, used_for: "Əhali (01.01.2026), sıxlıq, 10 min nəfərə düşən göstəricilər" },
    { key: "elevation", name: "Open-Meteo Elevation API (Copernicus DEM 90 m)", url: "https://open-meteo.com/en/docs/elevation-api", badge: "computed", status: Object.keys(meteo.regions).length ? "ok" : "unavailable", date: "2026-10-09", coverage: `${regions.filter((r) => r.nature.elev_mean != null).length}/${regions.length} ərazi, hər ərazidə 5×5 şəbəkə`, used_for: "Hündürlük, relyef tipi (düzənlik/dağətəyi/dağlıq)" },
    { key: "climate", name: "Open-Meteo Historical Weather (ERA5)", url: "https://open-meteo.com/en/docs/historical-weather-api", badge: "model", status: Object.keys(meteo.regions).length ? "ok" : "unavailable", date: `${meteo.year ?? ""}`, coverage: `${regions.filter((r) => r.climate.july_max_c != null).length}/${regions.length} ərazi (mərkəz nöqtəsi)`, used_for: "İyul orta maksimum, yanvar orta minimum, illik yağıntı" },
    { key: "air", name: "Open-Meteo Air Quality (CAMS modeli)", url: "https://open-meteo.com/en/docs/air-quality-api", badge: "model", status: Object.keys(meteo.regions).length ? "ok" : "unavailable", date: "son 30 gün", coverage: `${regions.filter((r) => r.air.pm25 != null).length}/${regions.length} ərazi`, used_for: "PM2.5 (ölçmə deyil, model)" },
    { key: "prices", name: "Daşınmaz əmlak qiymətləri (data/manual/prices.csv)", url: null, badge: "mock", status: "partial", date: "2026-10-09", coverage: `${realPrices.length} dərc olunmuş dəyər, ${priceLog.length - realPrices.length} demo dəyər; ${Object.keys(prices).length} ərazi`, used_for: "Qiymətlər, əlçatanlıq indeksi, büdcə filtri, həqiqi xərc" },
    { key: "legal", name: "Hüquqi mətnlər (e-qanun.az)", url: "https://e-qanun.az", badge: "official", status: fs.existsSync("data/legal") && fs.readdirSync("data/legal").some((f) => f.endsWith(".md")) ? "ok" : "unavailable", date: null, coverage: "Maddə mətni yoxdursa, AI maddə nömrəsi göstərmir", used_for: "Hüquqi yoxlama" },
    { key: "google", name: "Google Places API", url: "https://developers.google.com/maps/documentation/places", badge: "osm", status: process.env.GOOGLE_MAPS_API_KEY ? "ok" : "unavailable", date: null, coverage: "Açar yoxdur — istifadə olunmur", used_for: "Gələcək: seçilmiş ərazi üçün canlı zənginləşdirmə" },
    { key: "yandex_waze", name: "Yandex / Waze", url: null, badge: "osm", status: "future", date: null, coverage: "Gələcəkdə tərəfdaşlıqla (scraping edilmir)", used_for: "Tıxac və real səyahət vaxtı" },
  ],
  prices: priceLog,
};
fs.mkdirSync("data/processed", { recursive: true });
fs.writeFileSync("data/processed/sources.json", JSON.stringify(sources, null, 1));
fs.writeFileSync("public/data/sources.json", JSON.stringify(sources));

const size = fs.readdirSync("public/data").reduce((s, f) => s + fs.statSync(`public/data/${f}`).size, 0);
console.log(`regions: ${regions.length} (az ${regions.filter((r) => r.level === "rayon").length}, baku ${regions.filter((r) => r.level === "baku_district").length}); prices real=${realPrices.length} demo=${priceLog.length - realPrices.length} unmatched=${priceLog.filter((p) => p.status === "unmatched").length}; ai=${Object.keys(aiProfiles).length}; public/data ${(size / 1024).toFixed(0)} KB`);
