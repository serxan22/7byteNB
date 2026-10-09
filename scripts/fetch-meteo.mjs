// Open-Meteo: elevation (5×5 grid per region), climate (last full year at centroid), air (PM2.5, 30d mean, CAMS model).
// Input: data/processed/regions-geo.json [{id, centroid, grid}]. Output: data/processed/meteo.json. All responses cached.
import fs from "node:fs";
import crypto from "node:crypto";

const CACHE = "data/raw/meteo";
fs.mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;

async function cached(url) {
  const f = `${CACHE}/${crypto.createHash("sha1").update(url).digest("hex")}.json`;
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(url.includes("elevation") ? 9000 : 700); // Open-Meteo weights multi-location calls; stay under 600/min
    try {
      const res = await fetch(url);
      if (res.ok) {
        const j = await res.json();
        fs.writeFileSync(f, JSON.stringify(j));
        return j;
      }
      console.log(`  ${res.status} ${url.slice(0, 90)}`);
      if (res.status === 429) await sleep(61000);
    } catch (e) {
      console.log(`  err ${e.message}`);
    }
  }
  fails++;
  return null;
}

const regions = JSON.parse(fs.readFileSync("data/processed/regions-geo.json", "utf8"));
const out = {};
const r1 = (x) => Math.round(x * 10) / 10;

// Elevation: batch grid points, ≤100 per call
const pts = [];
for (const r of regions) for (const p of r.grid) pts.push({ id: r.id, p });
const elev = {};
for (let i = 0; i < pts.length; i += 100) {
  const chunk = pts.slice(i, i + 100);
  const lat = chunk.map((c) => c.p[1].toFixed(4)).join(",");
  const lon = chunk.map((c) => c.p[0].toFixed(4)).join(",");
  const j = await cached(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
  if (!j) continue;
  j.elevation.forEach((e, k) => (elev[chunk[k].id] ||= []).push(e));
}

const year = new Date().getFullYear() - 1;
for (const r of regions) {
  const e = elev[r.id] ?? [];
  const o = { elev_mean: null, elev_min: null, elev_max: null, ruggedness: null, terrain: null };
  if (e.length) {
    const m = e.reduce((a, b) => a + b, 0) / e.length;
    const sd = Math.sqrt(e.reduce((a, b) => a + (b - m) ** 2, 0) / e.length);
    Object.assign(o, {
      elev_mean: Math.round(m),
      elev_min: Math.round(Math.min(...e)),
      elev_max: Math.round(Math.max(...e)),
      ruggedness: Math.round(sd),
      terrain: m < 200 && sd < 50 ? "düzənlik" : m > 1000 || sd > 250 ? "dağlıq" : "dağətəyi",
    });
  }
  const [lon, lat] = r.centroid.map((x) => x.toFixed(3));
  const c = await cached(
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${year}-01-01&end_date=${year}-12-31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FBaku`
  );
  if (c?.daily) {
    const d = c.daily;
    const idx = (mm) => d.time.map((t, i) => (t.slice(5, 7) === mm ? i : -1)).filter((i) => i >= 0);
    const avg = (arr, ii) => r1(ii.reduce((a, i) => a + (arr[i] ?? 0), 0) / ii.length);
    o.july_max_c = avg(d.temperature_2m_max, idx("07"));
    o.jan_min_c = avg(d.temperature_2m_min, idx("01"));
    o.precip_mm = Math.round(d.precipitation_sum.reduce((a, b) => a + (b ?? 0), 0));
  }
  const a = await cached(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm2_5&past_days=30&forecast_days=0`
  );
  if (a?.hourly?.pm2_5) {
    const v = a.hourly.pm2_5.filter((x) => x != null);
    o.pm25 = v.length ? r1(v.reduce((s, x) => s + x, 0) / v.length) : null;
  }
  out[r.id] = o;
  if (fails > 20) {
    console.log("too many failures — stopping (marked partial)");
    break;
  }
}
fs.writeFileSync("data/processed/meteo.json", JSON.stringify({ year, fails, regions: out }));
console.log(`meteo.json: ${Object.keys(out).length} regions, fails=${fails}`);
