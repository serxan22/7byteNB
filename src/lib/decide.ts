// Decision engine core (pure, deterministic): location catalog, keyword-baseline intent, retrieval + ranking, confidence.
// The LLM only does INTENT (text → structure) and EXPLAIN (candidates → prose); everything here is reproducible code.
import type { z } from "zod";
import type { IntentSchema } from "./schemas.ts";
import type { IndexKey, Region } from "./types.ts";

export type Intent = z.infer<typeof IntentSchema>;
export type Hex = {
  h: string; c: [number, number]; r: string; l: string; p: number[]; st: number;
  m: number | null; mn: string | null; s: number; sc: number | null; k: number | null; pk: number | null; rk: number; pv: number | null;
  pm?: number; pn?: number;
};
export type HexData = { res: number; cats: string[]; hexes: Hex[] };
export type LocationRef = { id: string; name: string; kind: "region" | "metro" | "place" };

const norm = (s: string) =>
  s.toLocaleLowerCase("az").replace(/ı/g, "i").replace(/ə/g, "e").replace(/ş/g, "s").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ğ/g, "g").normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Every location the intent model may reference. Built from data; nothing invented. */
export function locationCatalog(regions: Region[], hx: HexData): LocationRef[] {
  const out: LocationRef[] = regions.map((r) => ({ id: r.id, name: r.name, kind: "region" as const }));
  const metro = new Set(hx.hexes.map((h) => h.mn).filter((x): x is string => !!x));
  for (const m of metro) out.push({ id: `mt-${slug(m)}`, name: `${m} metrosu`, kind: "metro" });
  const places = new Set(hx.hexes.map((h) => h.l.split(" · ")[1]).filter((x) => x && !x.endsWith("m. ətrafı")));
  for (const p of places) out.push({ id: `pl-${slug(p)}`, name: p, kind: "place" });
  return out;
}

// ---------- keyword baseline (also the fallback when the LLM is unavailable) ----------
export function keywordIntent(text: string, catalog: LocationRef[]): Intent {
  const t = norm(text);
  const has = (...w: string[]) => w.some((x) => t.includes(norm(x)));
  const goal: Intent["goal"] = has("kafe aç", "aptek aç", "biznes", "aciram", "açmaq", "mağaza aç", "restoran aç", "obyekt aç") ? "open_business" : has("kiray") ? "rent" : has("investis", "sərmayə", "gəlir gətir") ? "invest" : "buy";
  let budget: number | null = null;
  const bm = t.match(/(\d+[.,]?\d*)\s*(min|k|mln|milyon)?\s*(manat|azn|₼|\$|dollar)?/);
  if (bm && (bm[2] || bm[3])) {
    budget = parseFloat(bm[1].replace(",", ".")) * (bm[2] === "min" || bm[2] === "k" ? 1000 : bm[2] === "mln" || bm[2] === "milyon" ? 1e6 : 1);
    if (bm[3] === "$" || bm[3] === "dollar") budget *= 1.7;
    if (budget < 1000) budget = null;
  }
  const m2m = t.match(/(\d{2,3})\s*(m2|m²|kv)/);
  const locs: string[] = [];
  for (const l of catalog) {
    const base = norm(l.name.replace(/ metrosu$/, ""));
    const stem = base.length > 6 ? base.slice(0, base.length - 2) : base;
    if (stem.length >= 4 && t.includes(stem)) locs.push(l.id);
  }
  const business_type: Intent["business_type"] = goal !== "open_business" ? null : has("kafe", "restoran", "qəhvə") ? "cafe" : has("aptek") ? "pharmacy" : has("market", "ərzaq", "mağaza") ? "grocery" : has("klinika", "stomatoloq") ? "clinic" : has("bağça") ? "kindergarten" : has("idman", "fitnes", "zal") ? "sport" : "other";
  const kids = has("uşaq", "ailə", "övlad");
  const missing: string[] = [];
  if (budget == null && goal !== "open_business") missing.push("budget_azn");
  if (!locs.length && !has("metro", "dağ", "dəniz", "kənar")) missing.push("locations");
  return {
    goal,
    property_type: goal === "open_business" ? "obyekt" : has("torpaq", "sot") ? "torpaq" : has("həyət", "bağ evi", "villa") ? "heyet_evi" : has("yeni tikili", "yeni bina") ? "menzil_yeni" : "menzil_kohne",
    budget_azn: budget,
    desired_m2: m2m ? Number(m2m[1]) : null,
    locations_mentioned: [...new Set(locs)],
    hard_constraints: {
      metro_within_m: has("metro") ? 800 : null,
      school_within_m: has("məktəb") ? 800 : null,
      kindergarten_within_m: has("bağça") && goal !== "open_business" ? 800 : null,
      park_within_m: has("park") ? 800 : null,
      max_price_m2: null,
      outside_baku: has("bakıdan kənar", "bakidan kenar", "rayonda", "kənddə"),
      mountain: has("dağ"),
      coastal: has("dəniz", "sahil"),
    },
    business_type,
    soft_preferences: {
      rahatliq: 0.6,
      neqliyyat: has("metro", "nəqliyyat", "iş") ? 0.9 : 0.4,
      tehsil: kids || has("tələbə", "universitet") ? 1 : 0.1,
      sehiyye: has("təqaüd", "xəstəxana", "yaşlı") ? 1 : 0.3,
      tebiet: has("sakit", "təbiət", "hava", "dəniz", "yaşıl", "dağ") ? 1 : 0.3,
      infrastruktur: 0.4,
      elcatanliq: has("ucuz", "büdcə", "qənaət") || budget ? 0.9 : 0.5,
    },
    household: kids ? "uşaqlı ailə" : has("tələbə") ? "tələbə" : has("təqaüd") ? "təqaüdçü" : null,
    missing_critical_fields: missing,
  };
}

// ---------- retrieval ----------
export type Candidate = {
  rank: number;
  kind: "hex" | "region";
  area_id: string;
  label: string;
  region_id: string;
  region_name: string;
  centroid: [number, number];
  score: number;
  fits_constraints: boolean;
  violations: string[];
  metrics: Record<string, number | string | null>;
};
export type Retrieval = { mode: "hex" | "region"; pool: number; candidates: Candidate[]; relaxed: string[]; scope: string };

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const distM = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 110570);
const BIZ_CAT: Record<string, string[]> = { cafe: ["food"], pharmacy: ["pharmacy"], grocery: ["grocery"], clinic: ["clinic", "hospital"], kindergarten: ["kindergarten"], sport: ["sport"], other: ["grocery", "food"] };

export function retrieve(intent: Intent, regions: Region[], hx: HexData, catalog: LocationRef[]): Retrieval {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const ci = (c: string) => hx.cats.indexOf(c);
  const locs = intent.locations_mentioned
    .map((id) => catalog.find((l) => l.id === id))
    .filter((l): l is LocationRef => !!l)
    .filter((l) => !(intent.hard_constraints.outside_baku && (l.id === "az-baki" || l.id.startsWith("bk-") || l.kind !== "region")));
  const hexRegions = new Set(hx.hexes.map((h) => h.r));
  const hc = intent.hard_constraints;
  const price = (rid: string) => byId.get(rid)?.prices[intent.property_type]?.value ?? byId.get(rid)?.prices.menzil_kohne?.value ?? null;
  const size = intent.desired_m2 ?? (intent.property_type === "heyet_evi" ? 120 : 75);

  // scope
  let mode: "hex" | "region" = "hex";
  let hexPool: Hex[] = [];
  let regPool: Region[] = [];
  let scope = "";
  const locHex = locs.filter((l) => l.kind !== "region" || hexRegions.has(l.id) || l.id === "az-baki");
  const locReg = locs.filter((l) => l.kind === "region" && !hexRegions.has(l.id) && l.id !== "az-baki");
  if (locHex.length) {
    const set = new Set<string>();
    for (const l of locHex) {
      for (const h of hx.hexes) {
        if (l.kind === "region" && (h.r === l.id || (l.id === "az-baki" && h.r.startsWith("bk-")))) set.add(h.h);
        if (l.kind === "metro" && h.mn && `mt-${slug(h.mn)}` === l.id && (h.m ?? 9e9) <= 1500) set.add(h.h);
        if (l.kind === "place" && h.l.includes(l.name)) set.add(h.h);
      }
    }
    hexPool = hx.hexes.filter((h) => set.has(h.h));
    scope = locHex.map((l) => l.name).join(", ");
  } else if (locReg.length) {
    mode = "region";
    regPool = locReg.map((l) => byId.get(l.id)!).filter(Boolean);
    scope = locReg.map((l) => l.name).join(", ");
  } else if (hc.outside_baku || hc.mountain || (intent.property_type === "heyet_evi" && intent.soft_preferences.tebiet >= 0.8)) {
    mode = "region";
    regPool = regions.filter((r) => r.level === "rayon" && r.id !== "az-baki" && r.coverage.per_capita !== "unreliable");
    scope = "Bakıdan kənar rayonlar";
  } else {
    hexPool = hx.hexes.filter((h) => h.r.startsWith("bk-"));
    scope = "Bakı";
  }

  // hard constraints, relaxed in reverse priority if nothing survives
  type Rule = { key: string; label: string; test: (x: Hex | Region) => boolean };
  const isHex = (x: Hex | Region): x is Hex => (x as Hex).h !== undefined;
  const rules: Rule[] = [];
  if (hc.metro_within_m) rules.push({ key: "metro", label: `metroya ≤${hc.metro_within_m} m`, test: (x) => (isHex(x) ? (x.m ?? 9e9) <= hc.metro_within_m! : x.transport.metro > 0) });
  if (hc.school_within_m) rules.push({ key: "school", label: `məktəbə ≤${hc.school_within_m} m`, test: (x) => (isHex(x) ? (x.sc ?? 9e9) <= hc.school_within_m! : (x.pois.school ?? 0) > 0) });
  if (hc.kindergarten_within_m) rules.push({ key: "kg", label: `bağçaya ≤${hc.kindergarten_within_m} m`, test: (x) => (isHex(x) ? (x.k ?? 9e9) <= hc.kindergarten_within_m! : (x.pois.kindergarten ?? 0) > 0) });
  if (hc.park_within_m) rules.push({ key: "park", label: `parka ≤${hc.park_within_m} m`, test: (x) => (isHex(x) ? (x.pk ?? 9e9) <= hc.park_within_m! : (x.pois.park ?? 0) > 0) });
  if (hc.mountain && mode === "region") rules.push({ key: "mountain", label: "dağlıq/dağətəyi", test: (x) => !isHex(x) && (x.nature.terrain === "dağlıq" || x.nature.terrain === "dağətəyi") });
  if (hc.coastal) rules.push({ key: "coastal", label: "sahilə yaxın", test: (x) => (isHex(x) ? byId.get(x.r)?.nature.coastal ?? false : x.nature.coastal) });
  if (hc.max_price_m2) rules.push({ key: "maxprice", label: `≤${hc.max_price_m2} ₼/m²`, test: (x) => { const p = price(isHex(x) ? x.r : x.id); return p == null || p <= hc.max_price_m2!; } });
  if (intent.budget_azn && intent.goal !== "open_business" && intent.goal !== "rent") rules.push({ key: "budget", label: `büdcə ${Math.round(intent.budget_azn / 1000)} min ₼`, test: (x) => { const p = price(isHex(x) ? x.r : x.id); return p == null || p * size <= intent.budget_azn!; } });

  const pool: (Hex | Region)[] = mode === "hex" ? hexPool : regPool;
  const relaxOrder = ["budget", "maxprice", "coastal", "park", "kg", "school", "mountain", "metro"];
  let active = [...rules];
  let filtered = pool.filter((x) => active.every((r) => r.test(x)));
  const relaxed: string[] = [];
  for (const k of relaxOrder) {
    if (filtered.length) break;
    const r = active.find((x) => x.key === k);
    if (!r) continue;
    active = active.filter((x) => x !== r);
    relaxed.push(r.label);
    filtered = pool.filter((x) => active.every((rr) => rr.test(x)));
  }
  if (!filtered.length) filtered = pool;

  // scoring
  const w = intent.soft_preferences;
  const biz = intent.goal === "open_business";
  const scoreHex = (h: Hex) => {
    const reg = byId.get(h.r)!;
    const n = (cats: string[]) => cats.reduce((s, c) => s + (h.p[ci(c)] ?? 0), 0);
    if (biz) {
      const comp = n(BIZ_CAT[intent.business_type ?? "other"]);
      const foot = n(["grocery", "food", "bank_atm", "pharmacy", "mall", "bazaar", "university"]) + h.st * 3 + (h.m != null && h.m < 600 ? 10 : 0);
      return 100 * (0.6 * clamp(foot / 40) + 0.4 * (1 - clamp(comp / 6)));
    }
    const f: Record<IndexKey, number> = {
      neqliyyat: 0.6 * clamp(1 - (h.m ?? 5000) / 2000) + 0.4 * clamp(1 - h.s / 800),
      rahatliq: clamp(n(["grocery", "pharmacy", "food", "bank_atm", "mall"]) / 15),
      tehsil: 0.6 * clamp(1 - (h.sc ?? 3000) / 1500) + 0.4 * clamp(1 - (h.k ?? 3000) / 1500),
      sehiyye: 0.5 * clamp(n(["hospital", "clinic", "pharmacy"]) / 5) + 0.5 * ((reg.indices.sehiyye ?? 30) / 100),
      tebiet: 0.6 * clamp(1 - (h.pk ?? 3000) / 1200) + 0.4 * ((reg.indices.tebiet ?? 30) / 100),
      infrastruktur: h.pv != null ? h.pv / 100 : (reg.indices.infrastruktur ?? 30) / 100,
      elcatanliq: (reg.indices.elcatanliq ?? 30) / 100,
    };
    let num = 0, den = 0;
    for (const k of Object.keys(f) as IndexKey[]) { num += (w[k] ?? 0) * f[k]; den += w[k] ?? 0; }
    return den ? (100 * num) / den : 50;
  };
  const scoreReg = (r: Region) => {
    let num = 0, den = 0;
    for (const k of Object.keys(w) as IndexKey[]) { num += (w[k] ?? 0) * (r.indices[k] ?? 30); den += w[k] ?? 0; }
    return den ? num / den : 50;
  };

  const scored = filtered.map((x) => ({ x, s: isHex(x) ? scoreHex(x) : scoreReg(x) })).sort((a, b) => b.s - a.s);
  // diversity: ≥900 m apart, ≤2 per region unless the user named one place
  const picks: typeof scored = [];
  const perReg: Record<string, number> = {};
  // the per-region cap only spreads results for broad queries; when the user named places, stay inside them
  const singleScope = locHex.length > 0 && !locHex.some((l) => l.id === "az-baki");
  for (const distinctLabels of [true, false]) {
    for (const c of scored) {
      if (picks.length >= 5) break;
      if (picks.includes(c)) continue;
      if (isHex(c.x)) {
        const hx2 = c.x;
        if (picks.some((p) => isHex(p.x) && distM(p.x.c, hx2.c) < 900)) continue;
        if (distinctLabels && picks.some((p) => isHex(p.x) && p.x.l === hx2.l)) continue;
        if (!singleScope && (perReg[hx2.r] ?? 0) >= 2) continue;
        perReg[hx2.r] = (perReg[hx2.r] ?? 0) + 1;
      }
      picks.push(c);
    }
  }
  picks.sort((a, b) => b.s - a.s);
  const candidates: Candidate[] = picks.map(({ x, s }, i) => {
    const violations = rules.filter((r) => !r.test(x)).map((r) => r.label);
    if (isHex(x)) {
      const reg = byId.get(x.r)!;
      const pp = reg.prices[intent.property_type] ?? reg.prices.menzil_kohne;
      const n = (c: string) => x.p[ci(c)] ?? 0;
      return {
        rank: i + 1, kind: "hex", area_id: x.h, label: x.l, region_id: reg.id, region_name: reg.name, centroid: x.c, score: Math.round(s), fits_constraints: !violations.length, violations,
        metrics: {
          nearest_metro: x.mn, metro_walk_m: x.m, bus_stop_m: x.s, school_m: x.sc, kindergarten_m: x.k, park_m: x.pk,
          grocery: n("grocery"), pharmacy: n("pharmacy"), food: n("food"), clinic: n("clinic") + n("hospital"), bus_stops_in_hex: x.st,
          paved_pct: x.pv, price_m2_district_avg: pp?.value ?? null, price_confidence: pp?.confidence ?? null, osm_coverage: reg.coverage.osm,
          price_m2_hex_median: x.pm ?? null, price_hex_listings: x.pn ?? null, deed_share_pct: reg.listings?.deed_share ?? null,
          ...(biz ? { competitors: BIZ_CAT[intent.business_type ?? "other"].reduce((s2, c) => s2 + n(c), 0) } : {}),
        },
      };
    }
    const pp = x.prices[intent.property_type] ?? x.prices.menzil_kohne;
    return {
      rank: i + 1, kind: "region", area_id: x.id, label: x.name, region_id: x.id, region_name: x.name, centroid: x.centroid, score: Math.round(s), fits_constraints: !violations.length, violations,
      metrics: {
        population: x.population.v, terrain: x.nature.terrain, elevation_m: x.nature.elev_mean, july_max_c: x.climate.july_max_c, pm25: x.air.pm25, coastal: x.nature.coastal ? "bəli" : "xeyr",
        ...Object.fromEntries(Object.entries(x.indices).map(([k, v]) => [`index_${k}`, v])),
        price_m2: pp?.value ?? null, price_confidence: pp?.confidence ?? null, osm_coverage: x.coverage.osm,
      },
    };
  });
  return { mode, pool: filtered.length, candidates, relaxed, scope };
}

// ---------- confidence (never produced by the LLM) ----------
export type Confidence = { score: number; label: "yüksək" | "orta" | "aşağı"; parts: { key: string; label: string; weight: number; value: number; note: string }[] };
export function confidence(intent: Intent, r: Retrieval): Confidence {
  const c = r.candidates;
  const cov = c.length ? c.reduce((s, x) => s + (({ yüksək: 1, orta: 0.6, aşağı: 0.3 } as Record<string, number | undefined>)[String(x.metrics.osm_coverage)] ?? 0.3), 0) / c.length : 0;
  const pr = c.length ? c.reduce((s, x) => s + (({ official: 1, estimate: 0.8, sample: 0.7, mock: 0.2 } as Record<string, number | undefined>)[String(x.metrics.price_confidence)] ?? 0), 0) / c.length : 0;
  const coverage = 0.6 * cov + 0.4 * pr;
  const needBudget = intent.goal !== "open_business";
  const known = [intent.locations_mentioned.length > 0 || Object.values(intent.hard_constraints).some((v) => v === true || (typeof v === "number" && v > 0)), !needBudget || intent.budget_azn != null, true];
  const completeness = known.filter(Boolean).length / known.length;
  const margin = c.length >= 2 ? clamp(((c[0].score - c[1].score) / Math.max(1, c[0].score)) * 5) : c.length ? 0.5 : 0;
  const fits = c.length ? c.filter((x) => x.fits_constraints).length / c.length : 0;
  const cons = fits * (r.relaxed.length ? 0.5 : 1);
  const parts = [
    { key: "coverage", label: "Məlumatın əhatəsi", weight: 40, value: coverage, note: `OSM əhatəsi ${Math.round(cov * 100)}%, qiymətlərin etibarlılığı ${Math.round(pr * 100)}% (demo qiymət aşağı sayılır)` },
    { key: "intent", label: "Sorğunun tamlığı", weight: 25, value: completeness, note: `${known.filter(Boolean).length}/${known.length} əsas sahə məlumdur (yer, büdcə, növ)` },
    { key: "margin", label: "Birinci ilə ikinci arasında fərq", weight: 20, value: margin, note: c.length >= 2 ? `${c[0].score} vs ${c[1].score} bal` : "müqayisə üçün namizəd azdır" },
    { key: "constraints", label: "Şərtlərə uyğunluq", weight: 15, value: cons, note: r.relaxed.length ? `yumşaldılan şərt: ${r.relaxed.join(", ")}` : `${Math.round(fits * 100)}% namizəd bütün şərtlərə uyğundur` },
  ];
  const score = Math.round(parts.reduce((s, p) => s + p.weight * p.value, 0));
  return { score, label: score >= 70 ? "yüksək" : score >= 45 ? "orta" : "aşağı", parts };
}
