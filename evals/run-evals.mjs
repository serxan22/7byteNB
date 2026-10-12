// Eval harness (F1–F4). Gemini free tier: sequential, delay between uncached calls; cached cases never re-run.
// Usage: node --dns-result-order=ipv4first evals/run-evals.mjs [intent|legal|grounding|retrieval|all]
import fs from "node:fs";
import { generateJSON } from "../src/lib/ai.ts";
import { IntentSchema, LegalSchema } from "../src/lib/schemas.ts";
import { INTENT_SYSTEM, LEGAL_SYSTEM, regionForAI } from "../src/lib/prompts.ts";
import { gazetteerLocations, keywordIntent, locationCatalog, normalizeLocations, retrieve } from "../src/lib/decide.ts";
const GAZ = JSON.parse(fs.readFileSync("public/data/gazetteer.json", "utf8"));
const ST = JSON.parse(fs.readFileSync("public/data/settlements.json", "utf8"));
import { legalDetect } from "../src/lib/fallbacks.ts";

try { process.loadEnvFile(".env.local"); } catch {}
const which = process.argv[2] ?? "all";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const az = read("public/data/regions-az.json"), bk = read("public/data/regions-baku.json");
const regions = [...az, ...bk];
const national = read("public/data/national.json");
const hx = read("public/data/mahalle.json"); // retrieval units = mahalle (hexes are only the compute grid)
const catalog = locationCatalog(regions, hx);
fs.mkdirSync("evals/results", { recursive: true });
const usage = [];

async function ai(prompt, schema, system, maxTokens) {
  for (let i = 0; i < 4; i++) {
    const r = await generateJSON(prompt, schema, { system, maxTokens });
    if (r.ok) {
      if (!r.cached) { if (r.usage) usage.push(r.usage); await sleep(6000); }
      return r.data;
    }
    if (r.reason !== "busy") return null;
    await sleep(15000 * 2 ** i);
  }
  return null;
}

// ---------- F1 intent ----------
const CONS_KEYS = { metro: "metro_within_m", school: "school_within_m", kindergarten: "kindergarten_within_m", park: "park_within_m", outside_baku: "outside_baku", mountain: "mountain", coastal: "coastal" };
function scoreIntent(pred, exp) {
  // outside_baku is implied (either value is correct) when every expected location is a non-Baku region
  const implied = exp.locs.length > 0 && exp.locs.every((id) => id.startsWith("az-") && id !== "az-baki");
  const consPred = Object.entries(CONS_KEYS).filter(([n, k]) => { const v = pred.hard_constraints[k]; return !(implied && n === "outside_baku") && (v === true || (typeof v === "number" && v > 0)); }).map(([n]) => n).sort();
  const regionLocs = pred.locations_mentioned.filter((id) => !id.startsWith("mt-") && !id.startsWith("pl-")).sort();
  return {
    goal: pred.goal === exp.goal,
    property_type: pred.property_type === exp.type,
    locations: JSON.stringify(regionLocs) === JSON.stringify([...exp.locs].sort()),
    constraints: JSON.stringify(consPred) === JSON.stringify([...exp.cons].sort()),
    budget: exp.budget ? pred.budget_azn != null && Math.abs(pred.budget_azn - exp.budget) / exp.budget < 0.05 : pred.budget_azn == null,
  };
}
async function evalIntent(lang = "az") {
  const cases = read(lang === "en" ? "evals/data/intent-cases-en.json" : "evals/data/intent-cases.json");
  const rows = [];
  for (const c of cases) {
    const base = keywordIntent(c.q, catalog);
    const pred = await ai(c.q, IntentSchema, INTENT_SYSTEM(catalog), 1500);
    const rawLocs = pred ? [...pred.locations_mentioned] : null;
    // same post-processing as /api/decide: catalogue normalisation, then gazetteer (village/qəsəbə → rayon)
    const post = (p) => { p.locations_mentioned = normalizeLocations(p.locations_mentioned, catalog); const gz = gazetteerLocations(c.q, GAZ, catalog, p.locations_mentioned); if (gz.length) p.locations_mentioned = normalizeLocations([...p.locations_mentioned, ...gz], catalog); };
    if (pred) post(pred);
    post(base);
    const gaz_locs = gazetteerLocations(c.q, GAZ, catalog, []);
    rows.push({ q: c.q, gaz_locs, expected: c, ai: pred ? scoreIntent(pred, c) : null, baseline: scoreIntent(base, c), ai_pred: pred && { goal: pred.goal, type: pred.property_type, locs: pred.locations_mentioned, raw_locs: rawLocs, budget: pred.budget_azn }, base_pred: { goal: base.goal, type: base.property_type, locs: base.locations_mentioned, budget: base.budget_azn } });
    process.stdout.write(pred ? "." : "x");
  }
  const fields = ["goal", "property_type", "locations", "constraints", "budget"];
  const acc = (who) => Object.fromEntries(fields.map((f) => [f, Math.round((rows.filter((r) => r[who]?.[f]).length / rows.filter((r) => r[who]).length) * 100)]));
  const gz = rows.filter((r) => r.expected.gaz);
  // gazetteer on its own (no AI): positives must resolve to the expected rayon, negatives ("3 otaqlı mənzil") to nothing
  const gzOnly = { positives: gz.length, resolved: gz.filter((r) => r.expected.locs.every((l) => r.gaz_locs.includes(l))).length, negatives: rows.filter((r) => r.expected.gazNeg).length, false_hits: rows.filter((r) => r.expected.gazNeg && r.gaz_locs.length).length };
  const out = { n: rows.length, ai_answered: rows.filter((r) => r.ai).length, accuracy: { ai: acc("ai"), baseline: acc("baseline") }, gazetteer: { ...gzOnly, n: gz.length, ai_locations: Math.round((gz.filter((r) => r.ai?.locations).length / Math.max(1, gz.filter((r) => r.ai).length)) * 100), baseline_locations: Math.round((gz.filter((r) => r.baseline.locations).length / Math.max(1, gz.length)) * 100) }, rows };
  fs.writeFileSync(lang === "en" ? "evals/results/intent-en.json" : "evals/results/intent.json", JSON.stringify(out, null, 1));
  console.log(`\nintent${lang === "en" ? "-en" : ""}`, JSON.stringify(out.accuracy));
}

// ---------- F2 legal ----------
async function evalLegal() {
  const cases = read("evals/data/legal-cases.json");
  const rows = [];
  for (const c of cases) {
    const base = legalDetect(c.t).length > 0;
    const r = await ai(c.t.slice(0, 4000), LegalSchema, `${LEGAL_SYSTEM}\n\nHüquqi mətnlər:\n(verilməyib — maddə nömrəsi çəkmə)`, 3000);
    const aiRisky = r ? r.red_flags.some((f) => f.risk !== "aşağı") : null;
    rows.push({ t: c.t, risky: c.risky, ai: aiRisky, baseline: base, ai_flags: r?.red_flags.map((f) => `${f.phrase} (${f.risk})`) ?? null });
    process.stdout.write(r ? "." : "x");
  }
  const pr = (who) => {
    const rs = rows.filter((x) => x[who] != null);
    const tp = rs.filter((x) => x[who] && x.risky).length, fp = rs.filter((x) => x[who] && !x.risky).length, fn = rs.filter((x) => !x[who] && x.risky).length;
    return { precision: Math.round((tp / Math.max(1, tp + fp)) * 100), recall: Math.round((tp / Math.max(1, tp + fn)) * 100), tp, fp, fn, n: rs.length };
  };
  const out = { n: rows.length, ai: pr("ai"), baseline: pr("baseline"), combined_note: "Saytda hər ikisi birlikdə işləyir: qayda tapdığını AI-ın siyahısına əlavə edir.", rows };
  fs.writeFileSync("evals/results/legal.json", JSON.stringify(out, null, 1));
  console.log("\nlegal", JSON.stringify({ ai: out.ai, baseline: out.baseline }));
}

// ---------- F3 grounding (precomputed AI profiles; no new calls) ----------
function evalGrounding(lang = "az") {
  const prof = (r) => (lang === "en" ? r.ai_en : r.ai);
  const allNums = (o, acc = []) => {
    if (typeof o === "number") acc.push(o);
    else if (o && typeof o === "object") for (const v of Object.values(o)) allNums(v, acc);
    return acc;
  };
  const rows = [];
  const sample = regions.filter((r) => prof(r)).sort((a, b) => a.id.localeCompare(b.id)).filter((_, i) => i % 3 === 0).slice(0, 30);
  for (const r of sample) {
    const input = regionForAI(r, national[r.level], lang);
    const ai = prof(r);
    const pool = allNums(input).filter((x) => Number.isFinite(x));
    const text = [ai.headline, ai.summary, ...ai.strengths, ...ai.weaknesses, ...ai.tags.map((t) => t.reason), ...ai.best_for, ...ai.watch_out, ai.confidence_note].join(" ");
    // numbers in text; "10 min sakin" (the per-10k unit), PM2.5, ÜST 5, years, and small ordinals are definitional, not data
    const clean = text.replace(/10\s*min\s*(sakin|nəfər)/gi, " ").replace(/10[,\s]?000\s*(residents|people|inhabitants)|per\s*10k/gi, " ").replace(lang === "en" ? /(\d),(\d{3})/g : /$^/, "$1$2").replace(/PM\s*2[.,]5/gi, " ").replace(/\b(19|20)\d{2}\b/g, " ").replace(/(\d)\s(\d{3})/g, "$1$2");
    const nums = (clean.match(/\d+(?:[.,]\d+)?/g) ?? []).map((s) => parseFloat(s.replace(",", "."))).filter((x) => x > 3);
    const bad = nums.filter((x) => !pool.some((p) => Math.abs(p - x) <= Math.max(0.011 * Math.abs(p), 0.051) || Math.abs(p * 100 - x) <= 1 || Math.abs(Math.round(p) - x) < 1));
    rows.push({ id: r.id, numbers: nums.length, ungrounded: bad.length, examples: bad.slice(0, 4) });
  }
  const tot = rows.reduce((s, r) => s + r.numbers, 0), un = rows.reduce((s, r) => s + r.ungrounded, 0);
  const out = { n_texts: rows.length, numbers: tot, ungrounded: un, grounded_pct: Math.round(((tot - un) / Math.max(1, tot)) * 1000) / 10, rows };
  fs.writeFileSync(lang === "en" ? "evals/results/grounding-en.json" : "evals/results/grounding.json", JSON.stringify(out, null, 1));
  console.log(`grounding${lang === "en" ? "-en" : ""}`, out.grounded_pct, "% of", tot, "numbers;", un, "ungrounded");
}

// ---------- F4 retrieval (deterministic) ----------
function evalRetrieval() {
  const cases = read("evals/data/retrieval-cases.json");
  const rows = cases.map((c) => {
    const intent = keywordIntent("ev", catalog);
    intent.locations_mentioned = c.locs;
    intent.hard_constraints = { metro_within_m: null, school_within_m: null, kindergarten_within_m: null, park_within_m: null, max_price_m2: null, outside_baku: false, mountain: false, coastal: false, ...c.cons };
    intent.budget_azn = null;
    const r = retrieve(intent, regions, hx, catalog, ST);
    const ok = r.candidates.filter((x) => x.fits_constraints).length;
    return { name: c.name, returned: r.candidates.length, satisfying: ok, relaxed: r.relaxed, pass: r.candidates.length > 0 && ok === r.candidates.length && !r.relaxed.length, sample: r.candidates.slice(0, 2).map((x) => x.label) };
  });
  const out = { n: rows.length, passed: rows.filter((r) => r.pass).length, pass_rate: Math.round((rows.filter((r) => r.pass).length / rows.length) * 100), rows };
  fs.writeFileSync("evals/results/retrieval.json", JSON.stringify(out, null, 1));
  console.log("retrieval", out.passed, "/", out.n);
}

if (which === "all" || which === "retrieval") evalRetrieval();
if (which === "all" || which === "grounding") evalGrounding();
if (which === "all" || which === "intent") await evalIntent();
if (which === "all" || which === "grounding-en") evalGrounding("en");
if (which === "all" || which === "intent-en") await evalIntent("en");
if (which === "all" || which === "legal") await evalLegal();
if (usage.length) {
  const prev = fs.existsSync("evals/results/usage.json") ? read("evals/results/usage.json").calls : [];
  const calls = [...prev, ...usage.map((u) => ({ ...u, kind: which }))];
  fs.writeFileSync("evals/results/usage.json", JSON.stringify({ calls, avg_in: Math.round(calls.reduce((s, u) => s + u.in, 0) / calls.length), avg_out: Math.round(calls.reduce((s, u) => s + u.out, 0) / calls.length) }, null, 1));
}
