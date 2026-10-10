import { NextResponse } from "next/server";
import { busyMsg, generateJSON } from "@/lib/ai";
import { LegalSchema } from "@/lib/schemas";
import { forLocale, LEGAL_SYSTEM } from "@/lib/prompts";
import { LEGAL_CHECKLIST, LEGAL_CHECKLIST_EN, legalDetect } from "@/lib/fallbacks";
import { loadLegal } from "@/lib/serverData";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = body?.text;
  const locale = body?.locale === "en" ? "en" : "az";
  const en = locale === "en";
  if (typeof text !== "string" || text.trim().length < 10) return NextResponse.json({ error: en ? "Paste the listing text (at least 10 characters)." : "Elanın mətnini yapışdır (ən azı 10 simvol)." }, { status: 400 });
  const legal = loadLegal();
  const system = `${forLocale(LEGAL_SYSTEM, locale)}\n\nHüquqi mətnlər:\n${legal || "(verilməyib — maddə nömrəsi çəkmə)"}`;
  const res = await generateJSON(text.slice(0, 4000), LegalSchema, { system, maxTokens: 3000 });
  const ai = res.ok ? res.data : null;
  const detected = legalDetect(text, locale);
  const result = ai ?? {
    red_flags: [],
    checklist: en ? LEGAL_CHECKLIST_EN : LEGAL_CHECKLIST,
    verdict: en
      ? detected.length ? `The listing contains high-risk phrases: do not pay a deposit before checking the documents. (Rule-based check: ${!res.ok && res.reason === "busy" ? busyMsg(locale) : "the AI is unavailable."})` : "No obvious risk phrases found, but still do the standard checks."
      : detected.length ? `Elanda yüksək riskli ifadələr var — sənədləri yoxlamadan beh verməyin. (Qayda əsaslı yoxlama — ${res.ok ? "" : res.reason === "busy" ? busyMsg(locale) : "AI əlçatan deyil."})` : "Açıq risk ifadəsi tapılmadı, amma standart yoxlamaları yenə də edin.",
  };
  // deterministic detector guarantees the known risk phrases are never missed
  for (const d of detected) if (!result.red_flags.some((f) => f.phrase.toLocaleLowerCase("az").includes(d.phrase))) result.red_flags.push(d);
  return NextResponse.json({ result: { ...result, disclaimer: en ? "This is not legal advice." : "Bu hüquqi məsləhət deyil." }, source: ai ? "ai" : "fallback" });
}
