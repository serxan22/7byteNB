import { NextResponse } from "next/server";
import { generateJSON } from "@/lib/ai";
import { PersonaSchema } from "@/lib/schemas";
import { PERSONA_SYSTEM } from "@/lib/prompts";
import { personaFallback } from "@/lib/fallbacks";
import { HUBS } from "@/lib/hubs";

export async function POST(req: Request) {
  const { text } = await req.json().catch(() => ({ text: "" }));
  if (typeof text !== "string" || text.trim().length < 5 || text.length > 600)
    return NextResponse.json({ error: "Özünü bir cümlə ilə təsvir et (5–600 simvol)." }, { status: 400 });
  const res = await generateJSON(text.trim(), PersonaSchema, { system: PERSONA_SYSTEM, maxTokens: 2000 });
  const ai = res.ok ? res.data : null;
  const persona = ai ?? personaFallback(text);
  if (persona.work_hub_id && !HUBS[persona.work_hub_id]) persona.work_hub_id = null; // never accept invented hubs
  for (const k of Object.keys(persona.weights) as (keyof typeof persona.weights)[]) persona.weights[k] = Math.min(1, Math.max(0, persona.weights[k]));
  return NextResponse.json({ persona, source: ai ? "ai" : "fallback", reason: res.ok ? undefined : res.reason });
}
