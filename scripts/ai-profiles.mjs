// Precomputes an AIProfile per region with Gemini (free tier: concurrency 1, ~4 s between calls, backoff on 429).
// Resumable: regions already in data/processed/ai-profiles.json are skipped (use --force to redo).
// Order: Baku districts + main cities first, then the remaining rayons.
import fs from "node:fs";
import { generateJSON, AI_MODEL } from "../src/lib/ai.ts";
import { AIProfileSchema } from "../src/lib/schemas.ts";
import { PROFILE_SYSTEM, regionForAI } from "../src/lib/prompts.ts";

try { process.loadEnvFile(".env.local"); } catch {}
const OUT = "data/processed/ai-profiles.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const force = process.argv.includes("--force");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");

const az = JSON.parse(fs.readFileSync("public/data/regions-az.json", "utf8"));
const baku = JSON.parse(fs.readFileSync("public/data/regions-baku.json", "utf8"));
const national = JSON.parse(fs.readFileSync("public/data/national.json", "utf8"));
const done = fs.existsSync(OUT) && !force ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};

const PRIORITY = ["az-baki", "az-gence", "az-sumqayit", "az-mingecevir", "az-lenkeran", "az-seki", "az-quba"];
const queue = [...baku, ...PRIORITY.map((id) => az.find((r) => r.id === id)).filter(Boolean), ...az.filter((r) => !PRIORITY.includes(r.id))]
  .filter((r) => !done[r.id] && (!only || only.includes(r.id)));
console.log(`model ${process.env.AI_MODEL || AI_MODEL}; ${Object.keys(done).length} done, ${queue.length} to go`);

let failures = 0;
for (const r of queue) {
  const prompt = `Ərazinin göstəriciləri (JSON):\n${JSON.stringify(regionForAI(r, national[r.level]))}`;
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await generateJSON(prompt, AIProfileSchema, { system: PROFILE_SYSTEM, maxTokens: 3000 });
    if (res.ok || res.reason !== "busy") break;
    const wait = 15000 * 2 ** attempt;
    console.log(`  ${r.id}: busy/429 → wait ${wait / 1000}s`);
    await sleep(wait);
  }
  if (res.ok) {
    const p = res.data;
    p.tags = p.tags.slice(0, 4);
    done[r.id] = p;
    fs.writeFileSync(OUT, JSON.stringify(done, null, 1));
    console.log(`✓ ${r.id} (${res.cached ? "cache" : res.model}) — ${p.headline}`);
    if (!res.cached) await sleep(8000);
  } else {
    failures++;
    console.log(`✗ ${r.id}: ${res.reason}`);
    if (res.reason === "no_key" || failures > 8) break;
    await sleep(4000);
  }
}
console.log(`profiles: ${Object.keys(done).length}/${az.length + baku.length}`);
