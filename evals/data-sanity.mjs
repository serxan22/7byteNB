// F5 / A1 guard: deterministic data checks over public/data. Fails the build (exit 1) on hard errors.
import fs from "node:fs";

const az = JSON.parse(fs.readFileSync("public/data/regions-az.json", "utf8"));
const baku = JSON.parse(fs.readFileSync("public/data/regions-baku.json", "utf8"));
const all = [...az, ...baku];
const checks = [];
const add = (name, pass, detail, hard = true) => checks.push({ name, pass, detail, hard });
const tot = (r) => Object.values(r.pois).reduce((a, b) => a + b, 0);

// 1. Completeness: 75 rayons + 12 Baku districts, every one with population + AI profile
add("75 rayon/şəhər var", az.length === 75, `${az.length}`);
add("Bakının 12 rayonu var", baku.length === 12, baku.map((r) => r.name).join(", "));
const noPop = all.filter((r) => !r.population.v);
add("Hər ərazinin əhalisi var (DSK)", !noPop.length, noPop.map((r) => r.id).join(", ") || "hamısında var");
const bakuSum = baku.reduce((s, r) => s + r.population.v, 0);
const bakuTotal = az.find((r) => r.id === "az-baki").population.v;
add("Bakı rayonlarının əhalisi cəmi = Bakı (±2%)", Math.abs(bakuSum - bakuTotal) / bakuTotal < 0.02, `${bakuSum} vs ${bakuTotal}`);

// 2. No NaN / negative numbers anywhere
const bad = [];
const walk = (o, path) => {
  if (typeof o === "number" && (!Number.isFinite(o) || (o < 0 && !/elev|jan_min|temp/.test(path)))) bad.push(path);
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
};
for (const r of all) walk({ ...r, ai: undefined }, r.id);
add("NaN və ya mənfi dəyər yoxdur", !bad.length, bad.slice(0, 5).join(", ") || "yoxdur");

// 3. A1 regression: no single region (except Baku) holds >25% of national POIs
const national = az.reduce((s, r) => s + tot(r), 0);
const dominant = az.filter((r) => r.id !== "az-baki" && tot(r) / national > 0.25);
add("Heç bir rayon ölkə POI-lərinin 25%-dən çoxunu tutmur (Bakıdan başqa)", !dominant.length, dominant.map((r) => r.id).join(", ") || `maks: ${Math.max(...az.filter((r) => r.id !== "az-baki").map((r) => tot(r) / national * 100)).toFixed(1)}%`);

// 4. A1 regression: plausible per-capita values (unreliable ones must be nulled + flagged)
const implausible = [];
for (const lvl of [az, baku]) {
  const p10 = lvl.map((r) => Object.values(r.per10k).filter((v) => v != null).reduce((a, b) => a + b, 0)).filter((x) => x > 0).sort((a, b) => a - b);
  const med = p10[Math.floor(p10.length / 2)];
  for (const r of lvl) {
    const v = Object.values(r.per10k).filter((x) => x != null).reduce((a, b) => a + b, 0);
    if (v > med * 10) implausible.push(`${r.id} (${v.toFixed(0)} vs median ${med.toFixed(0)})`);
  }
}
add("10 min sakinə düşən göstəricilər inandırıcıdır (≤10× median)", !implausible.length, implausible.join(", ") || "hamısı norma daxilində");
const flagged = all.filter((r) => r.coverage.per_capita === "unreliable");
add("Əhali–OSM uyğunsuzluğu olan ərazilər işarələnib", flagged.every((r) => r.coverage.note), flagged.map((r) => r.name).join(", ") || "yoxdur", false);

// 5. Index saturation: no region may score 99+ on ≥4 indices at once (Xankəndi-type outlier)
const saturated = all.filter((r) => Object.values(r.indices).filter((v) => v != null && v >= 99).length >= 4);
add("Heç bir ərazi 4+ indeksdə 99 almır", !saturated.length, saturated.map((r) => r.id).join(", ") || "yoxdur");

// 6. Plausible bounds
const oob = all.filter((r) => (r.air.pm25 != null && (r.air.pm25 < 1 || r.air.pm25 > 150)) || (r.climate.july_max_c != null && (r.climate.july_max_c < 10 || r.climate.july_max_c > 48)) || (r.density.v != null && r.density.v > 60000) || (r.roads.paved_known_pct != null && r.roads.paved_known_pct > 100));
add("PM2.5, temperatur, sıxlıq, asfalt % ağlabatan hədlərdə", !oob.length, oob.map((r) => r.id).join(", ") || "hamısı");
const prices = all.flatMap((r) => Object.entries(r.prices).map(([t, p]) => ({ id: r.id, t, ...p })));
const badPrice = prices.filter((p) => p.value != null && (p.unit === "AZN_m2" ? p.value < 200 || p.value > 20000 : p.value < 500 || p.value > 300000));
add("Qiymətlər ağlabatan hədlərdə (₼/m² 200–20 000)", !badPrice.length, badPrice.map((p) => `${p.id}:${p.t}`).join(", ") || `${prices.length} qiymət yoxlanıldı`);

// 7. Metro: OSM vs official list (data/manual/metro-stations.json, if present)
const bakuMetro = az.find((r) => r.id === "az-baki").transport.metro;
const official = fs.existsSync("data/manual/metro-stations.json") ? JSON.parse(fs.readFileSync("data/manual/metro-stations.json", "utf8")) : null;
if (official) add("Metro stansiyaları: OSM ≈ rəsmi siyahı (±3)", Math.abs(bakuMetro - official.stations.length) <= 3, `OSM ${bakuMetro} / rəsmi ${official.stations.length} (${official.source})`, false);
else add("Metro stansiyaları: rəsmi siyahı ilə müqayisə", false, `OSM ${bakuMetro}; rəsmi siyahı faylı yoxdur`, false);

// 8. Coverage stats (informational)
const low = all.filter((r) => r.coverage.osm === "aşağı").length;
add("Aşağı OSM əhatəli ərazilərin payı", true, `${low}/${all.length} (${Math.round((low / all.length) * 100)}%)`, false);
const real = prices.filter((p) => p.confidence !== "mock").length;
add("Real (dərc olunmuş) qiymətlərin payı", true, `${real}/${prices.length}`, false);

const hardFail = checks.filter((c) => c.hard && !c.pass);
fs.mkdirSync("evals/results", { recursive: true });
fs.writeFileSync("evals/results/data-sanity.json", JSON.stringify({ ran_at: new Date().toISOString(), passed: checks.filter((c) => c.pass).length, total: checks.length, checks }, null, 1));
for (const c of checks) console.log(`${c.pass ? "✓" : c.hard ? "✗" : "!"} ${c.name} — ${c.detail}`);
if (hardFail.length) process.exit(1);
