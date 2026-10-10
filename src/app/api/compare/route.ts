import { NextResponse } from "next/server";
import { busyMsg, generateJSON } from "@/lib/ai";
import { CompareSchema } from "@/lib/schemas";
import { COMPARE_SYSTEM, forLocale, regionForAI } from "@/lib/prompts";
import { loadData } from "@/lib/serverData";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const locale = body?.locale === "en" ? "en" : "az";
  const en = locale === "en";
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.slice(0, 3) : [];
  const { regions, national } = loadData();
  const rs = ids.map((id) => regions.find((r) => r.id === id)).filter((r) => !!r);
  if (rs.length < 2) return NextResponse.json({ error: en ? "Choose 2–3 areas" : "2–3 ərazi seç" }, { status: 400 });
  const user = JSON.stringify(rs.map((r) => regionForAI(r, national[r.level], locale)));
  const res = await generateJSON(user, CompareSchema, { system: forLocale(COMPARE_SYSTEM, locale), maxTokens: 3000 });
  if (!res.ok) return NextResponse.json({ result: null, source: "fallback", message: res.reason === "busy" ? busyMsg(locale) : en ? "The AI comparison is unavailable right now." : "AI müqayisəsi hazırda əlçatan deyil." });
  return NextResponse.json({ result: res.data, source: "ai" });
}
