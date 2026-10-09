// DSK (stat.gov.az) table 1.15: area, population (01.01.2026) and density per rayon / Baku district.
// Caches the raw xls in data/raw/dsk/, writes data/processed/population.json.
import fs from "node:fs";
import XLSX from "xlsx";

const URL = "https://www.stat.gov.az/source/demoqraphy/az/001_15.xls";
const RAW = "data/raw/dsk/001_15.xls";
fs.mkdirSync("data/raw/dsk", { recursive: true });
if (!fs.existsSync(RAW)) {
  const res = await fetch(URL, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`DSK ${res.status}`);
  fs.writeFileSync(RAW, Buffer.from(await res.arrayBuffer()));
}

const wb = XLSX.readFile(RAW);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
const out = [];
let group = null;
for (const r of rows) {
  const name = typeof r[0] === "string" ? r[0].replace(/\s+/g, " ").trim() : null;
  if (!name || typeof r[3] !== "number") continue;
  if (/cəmi|Respublikası$/.test(name)) {
    group = name.replace(/ - cəmi$/, "");
    if (/Respublikası$/.test(name)) { out.push({ name, kind: "country", area_km2: r[1] * 1000, pop: Math.round(r[3] * 1000), density: r[4] }); continue; }
    out.push({ name: group, kind: "group", area_km2: r[1] * 1000, pop: Math.round(r[3] * 1000), density: r[4] });
    continue;
  }
  out.push({ name, kind: "unit", group, area_km2: r[1] * 1000, pop: Math.round(r[3] * 1000), pop_2019: Math.round(r[2] * 1000), density: r[4] });
}
fs.mkdirSync("data/processed", { recursive: true });
fs.writeFileSync("data/processed/population.json", JSON.stringify({ source: "DSK 1.15", url: URL, date: "2026-01-01", rows: out }, null, 1));
console.log(`population.json: ${out.length} rows (${out.filter((o) => o.kind === "unit").length} units)`);
console.log(out.filter((o) => o.kind === "unit").slice(0, 3).map((o) => `${o.name}|${o.group}|${o.pop}`).join("  "));
