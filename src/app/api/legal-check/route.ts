import { NextResponse } from "next/server";
import { BUSY_MSG, generateJSON } from "@/lib/ai";
import { LegalSchema } from "@/lib/schemas";
import { LEGAL_SYSTEM } from "@/lib/prompts";
import { LEGAL_CHECKLIST, legalDetect } from "@/lib/fallbacks";
import { loadLegal } from "@/lib/serverData";

export async function POST(req: Request) {
  const { text } = await req.json().catch(() => ({ text: "" }));
  if (typeof text !== "string" || text.trim().length < 10) return NextResponse.json({ error: "Elanın mətnini yapışdır (ən azı 10 simvol)." }, { status: 400 });
  const legal = loadLegal();
  const system = `${LEGAL_SYSTEM}\n\nHüquqi mətnlər:\n${legal || "(verilməyib — maddə nömrəsi çəkmə)"}`;
  const res = await generateJSON(text.slice(0, 4000), LegalSchema, { system, maxTokens: 3000 });
  const ai = res.ok ? res.data : null;
  const detected = legalDetect(text);
  const result = ai ?? {
    red_flags: [],
    checklist: LEGAL_CHECKLIST,
    verdict: detected.length ? `Elanda yüksək riskli ifadələr var — sənədləri yoxlamadan beh verməyin. (Qayda əsaslı yoxlama — ${res.ok ? "" : res.reason === "busy" ? BUSY_MSG : "AI əlçatan deyil."})` : "Açıq risk ifadəsi tapılmadı, amma standart yoxlamaları yenə də edin.",
  };
  // deterministic detector guarantees the known risk phrases are never missed
  for (const d of detected) if (!result.red_flags.some((f) => f.phrase.toLocaleLowerCase("az").includes(d.phrase))) result.red_flags.push(d);
  return NextResponse.json({ result: { ...result, disclaimer: "Bu hüquqi məsləhət deyil." }, source: ai ? "ai" : "fallback" });
}
