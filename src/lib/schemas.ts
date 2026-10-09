import { z } from "zod";

export const IndexKeys = ["rahatliq", "neqliyyat", "tehsil", "sehiyye", "tebiet", "infrastruktur", "elcatanliq"] as const;
export const CategoryTags = ["aile_dostu", "genc_pesekar", "telebe", "teqaudcu", "biznes_furseti", "tebiet_sakitlik", "budce_dostu", "premium", "inkisafda", "turizm"] as const;

export const AIProfileSchema = z.object({
  headline: z.string().describe("≤12 words, Azerbaijani"),
  tags: z.array(z.object({ tag: z.enum(CategoryTags), reason: z.string() })).describe("2–4 tags"),
  summary: z.string().describe("3–5 sentences"),
  strengths: z.array(z.string()).describe("exactly 3, each ends with the metric value in parentheses"),
  weaknesses: z.array(z.string()).describe("exactly 3, each ends with the metric value in parentheses"),
  best_for: z.array(z.string()),
  watch_out: z.array(z.string()),
  confidence_note: z.string(),
});

const W = z.number().describe("weight 0..1");
export const PersonaSchema = z.object({
  property_type: z.enum(["menzil_yeni", "menzil_kohne", "heyet_evi", "obyekt", "torpaq"]),
  budget_azn: z.number().nullable(),
  desired_m2: z.number().nullable(),
  work_hub_id: z.string().nullable(),
  mode: z.enum(["metro", "bus", "car", "walk"]),
  weights: z.object({ rahatliq: W, neqliyyat: W, tehsil: W, sehiyye: W, tebiet: W, infrastruktur: W, elcatanliq: W }),
  hard_requirements: z.array(z.string()),
  summary_az: z.string(),
});

export const FitExplainSchema = z.object({
  fit_comment: z.string(),
  why: z.array(z.string()),
  trade_offs: z.array(z.string()),
});

export const AskSchema = z.object({ answer: z.string(), answerable: z.boolean() });

export const CompareSchema = z.object({
  summary: z.string(),
  per_region: z.array(z.object({ id: z.string(), verdict: z.string() })),
  who_should_pick: z.array(z.object({ persona: z.string(), region_id: z.string(), why: z.string() })),
});

export const LegalSchema = z.object({
  red_flags: z.array(z.object({ phrase: z.string(), meaning: z.string(), risk: z.enum(["yüksək", "orta", "aşağı"]) })),
  checklist: z.array(z.object({ step: z.string(), where: z.string(), document: z.string() })),
  verdict: z.string(),
});

// ---- data validation (npm run check) ----
const Val = z.object({ v: z.number().nullable(), badge: z.enum(["osm", "official", "computed", "sample", "mock", "model", "press"]) });
const Price = z.object({
  value: z.number().nullable(),
  unit: z.enum(["AZN_m2", "AZN_sot"]),
  n: z.number(),
  source: z.string(),
  source_url: z.string().optional(),
  confidence: z.enum(["official", "sample", "estimate", "mock"]),
});
export const RegionSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.enum(["rayon", "baku_district"]),
  parent_id: z.string().optional(),
  centroid: z.tuple([z.number(), z.number()]),
  area_km2: z.number(),
  population: Val,
  density: Val,
  pois: z.record(z.string(), z.number()),
  per10k: z.record(z.string(), z.number().nullable()),
  transport: z.object({
    metro: z.number(),
    rail: z.number(),
    bus_stops: z.number(),
    bus_routes: z.number(),
    nearest_metro_km: z.number().nullable().optional(),
    route_refs: z.array(z.string()).optional(),
  }),
  roads: z.object({ total_km: z.number(), paved_pct: z.number().nullable(), unpaved_pct: z.number().nullable(), unknown_pct: z.number().nullable(), paved_known_pct: z.number().nullable().optional() }),
  nature: z.object({
    elev_mean: z.number().nullable(),
    elev_min: z.number().nullable(),
    elev_max: z.number().nullable(),
    ruggedness: z.number().nullable(),
    terrain: z.enum(["düzənlik", "dağətəyi", "dağlıq"]).nullable(),
    coastal: z.boolean(),
    landcover: z.record(z.string(), z.number()),
  }),
  climate: z.object({ july_max_c: z.number().nullable(), jan_min_c: z.number().nullable(), precip_mm: z.number().nullable() }),
  air: z.object({ pm25: z.number().nullable() }),
  prices: z.record(z.string(), Price),
  indices: z.record(z.string(), z.number().nullable()),
  coverage: z.object({ osm: z.enum(["yüksək", "orta", "aşağı"]), prices: z.enum(["official", "sample", "estimate", "mock", "none"]) }),
  ai: AIProfileSchema.optional(),
});
