import { NextResponse } from "next/server";
import { BUSY_MSG, generateJSON } from "@/lib/ai";
import { AskSchema } from "@/lib/schemas";
import { ASK_SYSTEM, regionForAI } from "@/lib/prompts";
import { loadData } from "@/lib/serverData";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const q = typeof body?.question === "string" ? body.question.trim().slice(0, 400) : "";
  const { regions, national } = loadData();
  const r = regions.find((x) => x.id === body?.regionId);
  if (!q || !r) return NextResponse.json({ error: "Sual və ərazi lazımdır" }, { status: 400 });
  const res = await generateJSON(JSON.stringify({ question: q, region: regionForAI(r, national[r.level]) }), AskSchema, { system: ASK_SYSTEM, maxTokens: 1500 });
  if (!res.ok) return NextResponse.json({ answer: res.reason === "busy" ? BUSY_MSG : "AI hazırda əlçatan deyil. Paneldəki göstəricilərə bax: hər rəqəmin mənbə nişanı var.", source: "fallback" });
  return NextResponse.json({ answer: res.data.answer, answerable: res.data.answerable, source: "ai" });
}
