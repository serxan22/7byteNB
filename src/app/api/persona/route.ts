import { NextResponse } from "next/server";
import { generateJSON } from "@/lib/ai";
import { PersonaSchema } from "@/lib/schemas";
import { forLocale, PERSONA_SYSTEM } from "@/lib/prompts";
import { personaFallback } from "@/lib/fallbacks";
import { HUBS } from "@/lib/hubs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const text = body?.text;
  const locale = body?.locale === "en" ? "en" : "az";
  const en = locale === "en";
  if (typeof text !== "string" || text.trim().length < 5 || text.length > 600)
    return NextResponse.json({ error: en ? "Describe yourself in one sentence (5–600 characters)." : "Özünü bir cümlə ilə təsvir et (5–600 simvol)." }, { status: 400 });
  const res = await generateJSON(text.trim(), PersonaSchema, { system: forLocale(PERSONA_SYSTEM, locale), maxTokens: 2000 });
  const ai = res.ok ? res.data : null;
  const persona = ai ?? personaFallback(text, locale);
  if (persona.work_hub_id && !HUBS[persona.work_hub_id]) persona.work_hub_id = null; // never accept invented hubs
  for (const k of Object.keys(persona.weights) as (keyof typeof persona.weights)[]) persona.weights[k] = Math.min(1, Math.max(0, persona.weights[k]));
  return NextResponse.json({ persona, source: ai ? "ai" : "fallback", reason: res.ok ? undefined : res.reason });
}
