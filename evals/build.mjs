// Merges evals/results/*.json + failure cases + cost model into public/data/evals.json (shown on /keyfiyyet).
import fs from "node:fs";
const r = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d);
const usage = r("evals/results/usage.json");
// Prices per 1M tokens (USD). Third-party trackers; Google's page could not be opened — verify before budgeting.
const PRICES = {
  assumed: { model: "gemini-3.7-flash (əsas model)", model_en: "gemini-3.7-flash (primary model)", in: 0.375, out: 1.88, source: "pricepertoken.com (Google təsdiqi tapılmadı)", source_en: "pricepertoken.com (no Google confirmation found)" },
  conservative: { model: "gemini-3.5-flash (ehtiyat model)", model_en: "gemini-3.5-flash (fallback model)", in: 1.5, out: 9.0, source: "benchlm.ai / morphllm.com" },
};
const avgIn = usage?.avg_in ?? null, avgOut = usage?.avg_out ?? null;
// model names are read from the AI wrapper so this page can never drift from what the app actually calls
const aiSrc = fs.readFileSync("src/lib/ai.ts", "utf8");
const MODELS = { primary: aiSrc.match(/AI_MODEL \|\| "([^"]+)"/)?.[1] ?? null, fallbacks: (aiSrc.match(/AI_FALLBACK_MODELS \|\| "([^"]+)"/)?.[1] ?? "").split(",") };
const usedCounts = (usage?.calls ?? []).reduce((o, c) => ((o[c.model ?? "naməlum"] = (o[c.model ?? "naməlum"] ?? 0) + 1), o), {});
const CALLS_PER_SESSION = 4; // decide = intent + explain (2), 1 follow-up ask/compare, 1 legal check
const cost = (p) => (avgIn == null ? null : ((avgIn * p.in + avgOut * p.out) / 1e6) * CALLS_PER_SESSION);
// English copies for /en/keyfiyyet. Place names stay Azerbaijani; only generic words are translated.
const SANITY_EN = r("evals/data/sanity-en.json", {});
const DETAIL_EN = [[/hamısında var/, "all have one"], [/hamısı norma daxilində/, "all within range"], [/^hamısı$/, "all"], [/^yoxdur$/, "none"], [/maks fərq/, "max difference"], [/maks:/, "max:"], [/qiymət yoxlanıldı/, "prices checked"], [/parça yoxlanıldı/, "cells checked"], [/məhəllə yoxlanıldı/, "neighbourhoods checked"], [/ad yoxlanıldı/, "names checked"], [/(\d+) ad$/, "$1 names"], [/(\d+) rayon$/, "$1 districts"], [/rəsmi siyahı faylı yoxdur/, "official list file missing"], [/rəsmi/g, "official"], [/işləyən/g, "operating"], [/ stansiya;/, " stations;"], [/metro.gov.az əlçatan olmadı/, "metro.gov.az unreachable"]];
const QUERY_EN = [[/^Bakıdan kənar \+ dağlıq$/, "Outside Baku + mountainous"], [/^Sahilə yaxın rayon$/, "Coastal district"], [/məktəb/g, "school"], [/bağça/g, "kindergarten"], [/₼\/m²/g, "AZN/m²"]];
const tr = (s, rules) => rules.reduce((x, [re, to]) => x.replace(re, to), s);
const enSanity = (s) => s && { ...s, checks: s.checks.map((c) => ({ ...c, name_en: SANITY_EN[c.name] ?? null, detail_en: tr(c.detail, DETAIL_EN) })) };
const enRetrieval = (x) => x && { ...x, rows: x.rows.map((row) => ({ ...row, name_en: tr(row.name, QUERY_EN) })) };
const out = {
  generated_at: new Date().toISOString(),
  intent: r("evals/results/intent.json"),
  legal: r("evals/results/legal.json"),
  grounding: r("evals/results/grounding.json"),
  intent_en: r("evals/results/intent-en.json"),
  grounding_en: r("evals/results/grounding-en.json"),
  retrieval: enRetrieval(r("evals/results/retrieval.json")),
  sanity: enSanity(r("evals/results/data-sanity.json")),
  profile_quality: r("evals/results/profile-quality-before.json"),
  failures: r("evals/data/failures.json", []),
  cost: {
    avg_tokens_in: avgIn, avg_tokens_out: avgOut, measured_calls: usage?.calls.length ?? 0, calls_per_session: CALLS_PER_SESSION,
    per_session_usd: { assumed: cost(PRICES.assumed), conservative: cost(PRICES.conservative) },
    per_1000_users_usd: { assumed: cost(PRICES.assumed) && cost(PRICES.assumed) * 1000, conservative: cost(PRICES.conservative) && cost(PRICES.conservative) * 1000 },
    prices: PRICES,
    models: MODELS,
    calls_by_model: usedCounts,
    notes: "Pulsuz Gemini limiti demo üçün kifayətdir; keş təkrar sorğuları pulsuz edir. Hostinq: Vercel Hobby (pulsuz), məlumat statikdir.",
    notes_en: "The free Gemini tier is enough for the demo; the cache makes repeat queries free. Hosting: Vercel Hobby (free), the data is static.",
  },
};
// strip row-level detail that is too long for the page
if (out.intent) out.intent.rows = out.intent.rows.map((x) => ({ q: x.q, ai: x.ai, baseline: x.baseline }));
if (out.legal) out.legal.rows = out.legal.rows.map((x) => ({ t: x.t, risky: x.risky, ai: x.ai, baseline: x.baseline, ai_flags: x.ai_flags }));
fs.writeFileSync("public/data/evals.json", JSON.stringify(out));
console.log("evals.json:", Object.entries(out).filter(([, v]) => v).map(([k]) => k).join(", "));
