// Single AI wrapper (Google Gemini). generateJSON(prompt, zodSchema): JSON mode + responseJsonSchema,
// zod validation, 1 retry with the validation error, sha256 cache, model fallback on 503/404, graceful failure.
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const AI_MODEL = process.env.AI_MODEL || "gemini-3.7-flash";
const FALLBACK_MODELS = (process.env.AI_FALLBACK_MODELS || "gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-flash-latest,gemini-3.5-flash-lite").split(",").map((s) => s.trim()).filter(Boolean);
export const hasAI = () => !!process.env.GEMINI_API_KEY;

export type AIUsage = { in: number; out: number };
export type AIResult<T> = { ok: true; data: T; cached: boolean; model: string; usage?: AIUsage } | { ok: false; reason: "no_key" | "busy" | "failed" };
export const BUSY_MSG = "AI hazırda məşğuldur — bir az sonra yenidən cəhd et.";

const CACHE_DIRS = [path.join(process.cwd(), "data/ai-cache"), "/tmp/meskan-ai-cache"];
let client: GoogleGenAI | null = null;

export const cacheKey = (parts: unknown) => crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
export function cacheRead(key: string) {
  for (const d of CACHE_DIRS) {
    const f = path.join(d, `${key}.json`);
    try {
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {}
  }
  return undefined;
}
function cacheWrite(key: string, value: unknown) {
  for (const d of CACHE_DIRS) {
    try {
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, `${key}.json`), JSON.stringify(value));
      return;
    } catch {}
  }
}

function jsonSchemaFor(schema: z.ZodType) {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

const statusOf = (e: unknown) => (typeof e === "object" && e && "status" in e ? Number((e as { status: unknown }).status) : 0);

export async function generateJSON<S extends z.ZodType>(
  prompt: string,
  schema: S,
  opts: { system?: string; maxTokens?: number; temperature?: number } = {}
): Promise<AIResult<z.infer<S>>> {
  const key = cacheKey({ v: 1, s: opts.system, p: prompt });
  const hit = cacheRead(key);
  if (hit !== undefined) {
    const ok = schema.safeParse(hit);
    if (ok.success) return { ok: true, data: ok.data, cached: true, model: "cache" };
  }
  if (!hasAI()) return { ok: false, reason: "no_key" };
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const responseJsonSchema = jsonSchemaFor(schema);
  const models = [AI_MODEL, ...FALLBACK_MODELS.filter((m) => m !== AI_MODEL)];
  let busy = false;
  for (const model of models) {
    let contents = prompt;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: opts.system,
            responseMimeType: "application/json",
            responseJsonSchema,
            maxOutputTokens: opts.maxTokens ?? 4096,
            temperature: opts.temperature ?? 0.3,
          },
        });
        let parsed: unknown;
        try {
          parsed = JSON.parse(res.text ?? "");
        } catch {
          parsed = undefined;
        }
        const check = schema.safeParse(parsed);
        if (check.success) {
          cacheWrite(key, check.data);
          const u = res.usageMetadata;
          return { ok: true, data: check.data, cached: false, model, usage: u ? { in: u.promptTokenCount ?? 0, out: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) } : undefined };
        }
        // one retry with the validation error appended
        contents = `${prompt}\n\nƏvvəlki cavab JSON sxemə uyğun deyildi: ${check.success ? "" : check.error.message.slice(0, 600)}\nDüzəldib yalnız etibarlı JSON qaytar.`;
      } catch (e) {
        const st = statusOf(e);
        // 429/503: quota or overload is per model on the free tier → try the next model
        if (st === 429 || st === 503 || st === 404 || st === 500) {
          busy = busy || st === 429 || st === 503;
          break; // try next model
        }
        console.error("AI error", st, e instanceof Error ? e.message.slice(0, 200) : e);
        return { ok: false, reason: "failed" };
      }
    }
  }
  return { ok: false, reason: busy ? "busy" : "failed" };
}
