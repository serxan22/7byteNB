// npm run check (part 1): validates public/data against the zod contract and the size budget.
import fs from "node:fs";
import { z } from "zod";
import { RegionSchema } from "../src/lib/schemas.ts";

let ok = true;
for (const f of ["regions-az.json", "regions-baku.json"]) {
  const data = JSON.parse(fs.readFileSync(`public/data/${f}`, "utf8"));
  const res = z.array(RegionSchema).safeParse(data);
  if (!res.success) {
    ok = false;
    console.error(`✗ ${f}:`, res.error.issues.slice(0, 5));
  } else {
    const noPop = data.filter((r) => r.population.v == null).length;
    const ai = data.filter((r) => r.ai).length;
    console.log(`✓ ${f}: ${data.length} regions, ${ai} with AI profile, ${noPop} without population`);
  }
}
for (const f of ["regions-az.geojson", "regions-baku.geojson"]) {
  const g = JSON.parse(fs.readFileSync(`public/data/${f}`, "utf8"));
  const bad = g.features.filter((x) => !x.properties?.id || !/Polygon/.test(x.geometry?.type));
  if (bad.length) { ok = false; console.error(`✗ ${f}: ${bad.length} bad features`); }
}
const size = fs.readdirSync("public/data").reduce((s, f) => s + fs.statSync(`public/data/${f}`).size, 0);
console.log(`public/data total ${(size / 1024).toFixed(0)} KB (budget 4096 KB)`);
if (size > 4 * 1024 * 1024) ok = false;
if (!ok) process.exit(1);
