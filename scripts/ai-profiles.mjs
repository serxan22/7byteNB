// Precomputes an AIProfile per region with Gemini (free tier: concurrency 1, ~4 s between calls, backoff on 429).
// Resumable: regions already in data/processed/ai-profiles.json are skipped (use --force to redo).
// Order: Baku districts + main cities first, then the remaining rayons.
import fs from "node:fs";
import crypto from "node:crypto";
import { generateJSON, AI_MODEL } from "../src/lib/ai.ts";
import { AIProfileSchema } from "../src/lib/schemas.ts";
import { PROFILE_SYSTEM, regionForAI, forLocale } from "../src/lib/prompts.ts";

try { process.loadEnvFile(".env.local"); } catch {}
// --lang=en writes English profiles to a separate file (Azerbaijani stays the default)
const LANG = process.argv.find((a) => a.startsWith("--lang="))?.slice(7) ?? "az";
const OUT = LANG === "en" ? "data/processed/ai-profiles-en.json" : "data/processed/ai-profiles.json";
const SYSTEM = forLocale(PROFILE_SYSTEM, LANG);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const force = process.argv.includes("--force");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");

const az = JSON.parse(fs.readFileSync("public/data/regions-az.json", "utf8"));
const baku = JSON.parse(fs.readFileSync("public/data/regions-baku.json", "utf8"));
const national = JSON.parse(fs.readFileSync("public/data/national.json", "utf8"));
const done = fs.existsSync(OUT) && !force ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};

// B6 quality gate: generic or number-free profiles are regenerated
const FORBIDDEN = LANG === "en" ? ["great choice", "variety of opportunities", "something for everyone"] : ["yaxşı seçimdir", "müxtəlif imkanlar", "geniş imkanlar", "əlverişli mövqe", "hər kəs üçün"];
export function profileQuality(p) {
  const text = [p.headline, p.summary, ...p.strengths, ...p.weaknesses].join(" ");
  const nums = (text.match(/\d+([.,]\d+)?/g) ?? []).length;
  const issues = [];
  if (text.length < 400) issues.push("qısa");
  if (nums < 6) issues.push(`az rəqəm (${nums})`);
  if (FORBIDDEN.some((f) => text.toLocaleLowerCase("az").includes(f))) issues.push("qadağan ifadə");
  if (LANG !== "en" && !/[əğış]/.test(text)) issues.push("Azərbaycan hərfləri yoxdur");
  // English profiles: place names (capitalised) may keep Azerbaijani letters; any other word with them means the model wrote Azerbaijani
  if (LANG === "en" && (text.match(/(^|[\s(“"'-])[a-zəğışçöü]*[əğışçöü][a-zəğışçöü]*/g) ?? []).length > 1) issues.push("not English");
  if (p.strengths.length !== 3 || p.weaknesses.length !== 3) issues.push("3+3 deyil");
  return issues;
}
if (process.argv.includes("--quality")) {
  const bad = Object.entries(done).map(([id, p]) => [id, profileQuality(p)]).filter(([, i]) => i.length);
  fs.mkdirSync("evals/results", { recursive: true });
  if (LANG !== "en") fs.writeFileSync("evals/results/profile-quality-before.json", JSON.stringify({ total: Object.keys(done).length, failing: bad.length, examples: bad.slice(0, 10) }, null, 1));
  console.log(`quality: ${bad.length}/${Object.keys(done).length} profiles fail →`, bad.slice(0, 6).map(([id, i]) => `${id}: ${i.join(", ")}`).join(" | "));
  for (const [id] of bad) delete done[id];
}

const PRIORITY = ["az-baki", "az-gence", "az-sumqayit", "az-mingecevir", "az-lenkeran", "az-seki", "az-quba"];
// staleness: a profile is regenerated when the data it was written from has changed (input hash)
const inputHash = (r) => crypto.createHash("sha1").update(JSON.stringify(regionForAI({ ...r, ai: undefined }, national[r.level]))).digest("hex").slice(0, 12);
const stale = [...az, ...baku].filter((r) => done[r.id] && done[r.id]._h !== inputHash(r)).map((r) => r.id);
if (process.argv.includes("--refresh-stale")) for (const id of stale) delete done[id];
else if (stale.length) console.log(`${stale.length} profiles are stale (data changed) — run with --refresh-stale`);
const queue = [...baku, ...PRIORITY.map((id) => az.find((r) => r.id === id)).filter(Boolean), ...az.filter((r) => !PRIORITY.includes(r.id))]
  .filter((r) => !done[r.id] && (!only || only.includes(r.id)));
console.log(`model ${process.env.AI_MODEL || AI_MODEL}; ${Object.keys(done).length} done, ${queue.length} to go`);

let failures = 0;
for (const r of queue) {
  const prompt = `${LANG === "en" ? "Area indicators (JSON)" : "Ərazinin göstəriciləri (JSON)"}:\n${JSON.stringify(regionForAI(r, national[r.level], LANG))}${LANG === "en" ? "\n\nWrite every sentence in British English. Only place names stay in Azerbaijani." : ""}`;
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await generateJSON(prompt, AIProfileSchema, { system: SYSTEM, maxTokens: 3000 });
    if (res.ok || res.reason !== "busy") break;
    const wait = 15000 * 2 ** attempt;
    console.log(`  ${r.id}: busy/429 → wait ${wait / 1000}s`);
    await sleep(wait);
  }
  // the weaker fallback model sometimes answers in Azerbaijani: retry with a firmer instruction (new cache key)
  for (let k = 1; k <= 2 && res.ok && LANG === "en" && profileQuality(res.data).includes("not English"); k++) {
    await sleep(4000);
    res = await generateJSON(`${prompt}\n\nIMPORTANT (attempt ${k + 1}): the answer MUST be in English. Do not write any Azerbaijani words except place names.`, AIProfileSchema, { system: SYSTEM, maxTokens: 3000 });
  }
  if (res.ok && LANG === "en" && profileQuality(res.data).includes("not English")) res = { ok: false, reason: "not English" };
  if (res.ok) {
    const p = res.data;
    p.tags = p.tags.slice(0, 4);
    p._h = inputHash(r);
    done[r.id] = p;
    fs.writeFileSync(OUT, JSON.stringify(done, null, 1));
    console.log(`✓ ${r.id} (${res.cached ? "cache" : res.model}) — ${p.headline}`);
    if (!res.cached) await sleep(8000);
  } else {
    failures++;
    console.log(`✗ ${r.id}: ${res.reason}`);
    if (res.reason === "not English") failures--;
    if (res.reason === "no_key" || failures > 8) break;
    await sleep(4000);
  }
}
console.log(`profiles: ${Object.keys(done).length}/${az.length + baku.length}`);
