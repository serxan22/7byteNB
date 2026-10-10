import { NextResponse } from "next/server";
import { busyMsg, generateJSON } from "@/lib/ai";
import { ExplainSchema, IntentSchema } from "@/lib/schemas";
import { EXPLAIN_SYSTEM, forLocale, INTENT_SYSTEM } from "@/lib/prompts";
import { loadData, loadHexes, loadSettlements } from "@/lib/serverData";
import { confidence, keywordIntent, locationCatalog, normalizeLocations, retrieve, type Candidate, type Intent } from "@/lib/decide";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const locale = body?.locale === "en" ? "en" : "az";
  const en = locale === "en";
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 500) : "";
  if (question.length < 4) return NextResponse.json({ error: en ? "Describe what you are looking for in one sentence." : "Nə axtardığını bir cümlə ilə yaz." }, { status: 400 });
  const { regions } = loadData();
  const hx = loadHexes();
  const catalog = locationCatalog(regions, hx);

  // 1) INTENT (AI, structured) with the keyword baseline as fallback; ids are validated against the catalog
  const ir = await generateJSON(question, IntentSchema, { system: INTENT_SYSTEM(catalog), maxTokens: 1500 });
  const intent: Intent = ir.ok ? ir.data : keywordIntent(question, catalog);
  intent.locations_mentioned = normalizeLocations(intent.locations_mentioned, catalog);

  // 3) RETRIEVE (deterministic) + 5) CONFIDENCE (deterministic)
  const retrieval = retrieve(intent, regions, hx, catalog, loadSettlements(), locale);
  const conf = confidence(intent, retrieval, locale);

  // 4) EXPLAIN (AI, grounded on candidates only)
  const compact = retrieval.candidates.map((c) => ({ area_id: c.area_id, rank: c.rank, label: c.label, region: c.region_name, score: c.score, fits_constraints: c.fits_constraints, violations: c.violations, metrics: c.metrics }));
  const er = retrieval.candidates.length
    ? await generateJSON(JSON.stringify({ question, intent, relaxed_constraints: retrieval.relaxed, scope: retrieval.scope, candidates: compact }), ExplainSchema, { system: forLocale(EXPLAIN_SYSTEM, locale), maxTokens: 3000 })
    : null;
  let explain = er?.ok ? er.data : null;
  if (explain) explain.recommendations = explain.recommendations.filter((r) => retrieval.candidates.some((c) => c.area_id === r.area_id));
  if (!explain || !explain.recommendations.length) explain = templateExplain(retrieval.candidates, retrieval.relaxed, !!er && !er.ok && er.reason === "busy", locale);
  // 2) still answer, but end with ONE clarifying question when a critical field is missing
  if (!explain.clarifying_question && intent.missing_critical_fields.includes("budget_azn") && intent.goal !== "open_business") explain.clarifying_question = en ? "Roughly what is your budget? Then I can narrow the price filter." : "Büdcən təxminən nə qədərdir? Ona görə qiymət filtrini dəqiqləşdirim.";

  return NextResponse.json({
    question,
    intent,
    intent_source: ir.ok ? "ai" : "keyword",
    explain_source: er?.ok ? "ai" : "template",
    retrieval: { mode: retrieval.mode, pool: retrieval.pool, relaxed: retrieval.relaxed, scope: retrieval.scope },
    candidates: retrieval.candidates,
    explain,
    confidence: conf,
  });
}

function templateExplain(c: Candidate[], relaxed: string[], busy: boolean, locale: string) {
  if (locale === "en") return templateExplainEn(c, relaxed, busy);
  const fmtM = (v: unknown) => (typeof v === "number" ? `${v} m` : "—");
  return {
    answer_summary: c.length
      ? `${c.length} ərazi seçildi; ən yüksək bal: ${c[0].label} (${c[0].score}/100).${relaxed.length ? ` Yumşaldılan şərt: ${relaxed.join(", ")}.` : ""} ${busy ? busyMsg("az") : "(Qayda əsaslı izah.)"}`
      : "Şərtlərə uyğun ərazi tapılmadı.",
    recommendations: c.map((x) => ({
      area_id: x.area_id,
      why: x.kind === "settlement" ? `1.5 km radiusda ${x.metrics.grocery} ərzaq, ${x.metrics.school} məktəb, ${x.metrics.clinic} tibb müəssisəsi; dayanacaq ${fmtM(x.metrics.bus_stop_m)}.` : x.kind === "hex" ? `Metroya ${fmtM(x.metrics.metro_walk_m)} (${x.metrics.nearest_metro ?? "—"}), məktəbə ${fmtM(x.metrics.school_m)}, ${x.metrics.grocery} ərzaq mağazası.` : `Bal ${x.score}/100; relyef: ${x.metrics.terrain ?? "—"}, PM2.5 ${x.metrics.pm25 ?? "—"}.`,
      trade_off: x.violations.length ? `Uyğun gəlməyən şərt: ${x.violations.join(", ")}` : "Qiymət rayon ortasıdır, məhəllə üzrə fərqlənə bilər.",
      fits_constraints: x.fits_constraints,
    })),
    what_to_check_next: ["Elanlarda binanın çıxarışı olub-olmadığını yoxla", "Ərazini axşam saatlarında yerində gör"],
    clarifying_question: null as string | null,
  };
}

function templateExplainEn(c: Candidate[], relaxed: string[], busy: boolean) {
  const fmtM = (v: unknown) => (typeof v === "number" ? `${v} m` : "—");
  const terrain: Record<string, string> = { "düzənlik": "plain", "dağətəyi": "foothills", "dağlıq": "mountain" };
  return {
    answer_summary: c.length
      ? `${c.length} areas selected; highest score: ${c[0].label} (${c[0].score}/100).${relaxed.length ? ` Relaxed constraint: ${relaxed.join(", ")}.` : ""} ${busy ? busyMsg("en") : "(Rule-based explanation.)"}`
      : "No area matches the constraints.",
    recommendations: c.map((x) => ({
      area_id: x.area_id,
      why: x.kind === "settlement" ? `Within 1.5 km: ${x.metrics.grocery} grocery shops, ${x.metrics.school} schools, ${x.metrics.clinic} medical facilities; bus stop ${fmtM(x.metrics.bus_stop_m)}.` : x.kind === "hex" ? `Metro ${fmtM(x.metrics.metro_walk_m)} on foot (${x.metrics.nearest_metro ?? "—"}), school ${fmtM(x.metrics.school_m)}, ${x.metrics.grocery} grocery shops.` : `Score ${x.score}/100; terrain: ${terrain[String(x.metrics.terrain)] ?? "—"}, PM2.5 ${x.metrics.pm25 ?? "—"}.`,
      trade_off: x.violations.length ? `Constraint not met: ${x.violations.join(", ")}` : "The price is the district average and may differ by neighbourhood.",
      fits_constraints: x.fits_constraints,
    })),
    what_to_check_next: ["Check whether the building has a title extract (çıxarış) in the listings", "Visit the area in the evening"],
    clarifying_question: null as string | null,
  };
}
