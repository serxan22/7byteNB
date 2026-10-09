import { NextResponse } from "next/server";
import { generateJSON } from "@/lib/ai";
import { FitExplainSchema, PersonaSchema } from "@/lib/schemas";
import { FIT_SYSTEM, regionForAI } from "@/lib/prompts";
import { loadData } from "@/lib/serverData";
import { INDEX_KEYS } from "@/lib/score";

const LABEL: Record<string, string> = { rahatliq: "gündəlik rahatlıq", neqliyyat: "nəqliyyat", tehsil: "təhsil", sehiyye: "səhiyyə", tebiet: "təbiət", infrastruktur: "yol infrastrukturu", elcatanliq: "əlçatan qiymət" };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const persona = PersonaSchema.safeParse(body?.persona);
  const { regions, national } = loadData();
  const r = regions.find((x) => x.id === body?.regionId);
  if (!persona.success || !r) return NextResponse.json({ error: "Yanlış sorğu" }, { status: 400 });
  const user = JSON.stringify({ persona: persona.data, fit_score: body.fit, over_budget: !!body.overBudget, region: regionForAI(r, national[r.level]) });
  const res = await generateJSON(user, FitExplainSchema, { system: FIT_SYSTEM, maxTokens: 2000 });
  if (res.ok) return NextResponse.json({ result: res.data, source: "ai" });
  // rule-based fallback: strongest / weakest weighted indices
  const w = persona.data.weights;
  const ranked = INDEX_KEYS.filter((k) => (w[k] ?? 0) > 0.3 && r.indices[k] != null).sort((a, b) => (r.indices[b] ?? 0) - (r.indices[a] ?? 0));
  return NextResponse.json({
    source: "fallback",
    result: {
      fit_comment: `Uyğunluq balı ${body.fit}/100 — sənin üçün vacib indekslərin çəkili ortası${body.overBudget ? "; büdcədən baha olduğu üçün bal 70% azaldılıb" : ""}. (Qayda əsaslı izah — AI hazırda əlçatan deyil.)`,
      why: ranked.slice(0, 2).map((k) => `${LABEL[k]} indeksi ${r.indices[k]}/100`),
      trade_offs: ranked.slice(-2).reverse().filter((k) => (r.indices[k] ?? 100) < 50).map((k) => `${LABEL[k]} indeksi cəmi ${r.indices[k]}/100`),
    },
  });
}
