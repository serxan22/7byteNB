import { NextResponse } from "next/server";
import { busyMsg, generateJSON } from "@/lib/ai";
import { AskSchema } from "@/lib/schemas";
import { ASK_SYSTEM, forLocale, regionForAI } from "@/lib/prompts";
import { loadData } from "@/lib/serverData";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const locale = body?.locale === "en" ? "en" : "az";
  const en = locale === "en";
  const q = typeof body?.question === "string" ? body.question.trim().slice(0, 400) : "";
  const { regions, national } = loadData();
  const r = regions.find((x) => x.id === body?.regionId);
  if (!q || !r) return NextResponse.json({ error: en ? "A question and an area are required" : "Sual və ərazi lazımdır" }, { status: 400 });
  const res = await generateJSON(JSON.stringify({ question: q, region: regionForAI(r, national[r.level], locale) }), AskSchema, { system: forLocale(ASK_SYSTEM, locale), maxTokens: 1500 });
  if (!res.ok) return NextResponse.json({ answer: res.reason === "busy" ? busyMsg(locale) : en ? "The AI is unavailable right now. See the indicators in the panel: every figure has a source badge." : "AI hazırda əlçatan deyil. Paneldəki göstəricilərə bax: hər rəqəmin mənbə nişanı var.", source: "fallback" });
  return NextResponse.json({ answer: res.data.answer, answerable: res.data.answerable, source: "ai" });
}
