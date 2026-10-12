import { localizeLabel } from "./labels.ts";
// Decision engine core (pure, deterministic): location catalog, keyword-baseline intent, retrieval + ranking, confidence.
// The LLM only does INTENT (text → structure) and EXPLAIN (candidates → prose); everything here is reproducible code.
import type { z } from "zod";
import type { IntentSchema } from "./schemas.ts";
import type { IndexKey, Region } from "./types.ts";

export type Intent = z.infer<typeof IntentSchema>;
export type Hex = {
  h: string; c: [number, number]; r: string; l: string; p: number[]; st: number;
  m: number | null; mn: string | null; s: number; sc: number | null; k: number | null; pk: number | null; rk: number; pv: number | null;
  pm?: number; pn?: number; a?: number; rl?: number | null;
};
export type HexData = { res: number; cats: string[]; hexes: Hex[] };
export type Settlement = { id: string; n: string; ne?: string; t: 0 | 1; c: [number, number]; r: string; p: number[]; s: number | null };
export type SettlementData = { cats: string[]; radius_m: number; settlements: Settlement[] };
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

/** Deterministic post-processing of model output: unknown ids dropped, az-X → bk-X when only the Baku district exists,
 *  parent "az-baki" dropped when a Baku district/metro/place is named (it would widen the search to all of Baku). */
// ---------- official gazetteer (opendata.az): a village / qəsəbə name in the query → its rayon ----------
/** [name, englishName|0, type 0=kənd 1=qəsəbə 2=şəhər, rayonId]; stop = common words that are also settlement names */
export type GazEntry = [string, string | 0, 0 | 1 | 2, string];
export type GazData = { stop: string[]; rows: GazEntry[] };
// Azerbaijani case suffixes (normalised: ı→i, ə→e, ü→u), incl. the n/y buffer forms after a vowel: Lahıcda, Novxanıda, Qubaya
const SUFFIXES = ["ndan", "nden", "dan", "den", "nda", "nde", "nin", "nun", "da", "de", "ya", "ye", "in", "un", "a", "e"];
export const gazKey = (s: string) => norm(s).replace(/[^a-z0-9]+/g, " ").trim();
/** a token and its suffix-stripped stems (stem keeps ≥4 letters) */
export const gazStems = (tok: string) => [tok, ...SUFFIXES.filter((x) => tok.endsWith(x) && tok.length - x.length >= 4).map((x) => tok.slice(0, -x.length))];

/** Deterministic, after the LLM (the intent prompt does not list 4.6k settlements). Case-insensitive; a name matches a token
 *  (or 2–3 consecutive tokens) after suffix stripping, if it is ≥4 letters, not a common word (stoplist) and not a
 *  district / metro / catalogue place name. Ambiguous names (several rayons) resolve only via a rayon also named in the query
 *  or to the single şəhər/qəsəbə of that name; otherwise they are not guessed. */
export function gazetteerLocations(text: string, gaz: GazData, catalog: LocationRef[], already: string[]): string[] {
  const stop = new Set(gaz.stop);
  const taken = new Set(catalog.flatMap((l) => [gazKey(l.name), gazKey(l.name.replace(/ metrosu$/, ""))]));
  const index = new Map<string, GazEntry[]>();
  for (const g of gaz.rows) {
    if (taken.has(gazKey(g[0]))) continue; // e.g. the city record "Bakı"/"BAKU", or a village called "Nərimanov"
    for (const name of new Set([gazKey(g[0]), g[1] ? gazKey(g[1]) : ""])) if (name.length >= 4 && !stop.has(name) && !taken.has(name)) (index.get(name) ?? index.set(name, []).get(name)!).push(g);
  }
  const toks = gazKey(text).split(" ").filter(Boolean);
  const hits = new Map<string, GazEntry[]>();
  for (let i = 0; i < toks.length; i++)
    for (let k = 3; k >= 1; k--) {
      if (i + k > toks.length) continue;
      const head = toks.slice(i, i + k - 1).join(" ");
      const key = gazStems(toks[i + k - 1]).map((st) => (head ? `${head} ${st}` : st)).find((c) => index.has(c));
      if (key) { hits.set(key, index.get(key)!); break; } // longest match wins ("İkinci Aşıqlı" over "Aşıqlı")
    }
  const out: string[] = [];
  for (const cands of hits.values()) {
    const rayons = [...new Set(cands.map((c) => c[3]))];
    const named = rayons.filter((r) => already.includes(r));
    const towns = [...new Set(cands.filter((c) => c[2] > 0).map((c) => c[3]))];
    const pick = rayons.length === 1 ? rayons[0] : named.length === 1 ? named[0] : towns.length === 1 ? towns[0] : null;
    if (pick) out.push(pick);
  }
  return out;
}

export function normalizeLocations(ids: string[], catalog: LocationRef[]): string[] {
  const has = (id: string) => catalog.some((c) => c.id === id);
  let out = ids.map((id) => (has(id) ? id : id.startsWith("az-") && has(`bk-${id.slice(3)}`) ? `bk-${id.slice(3)}` : null)).filter((x): x is string => !!x);
  if (out.some((id) => id.startsWith("bk-") || id.startsWith("mt-") || id.startsWith("pl-"))) out = out.filter((id) => id !== "az-baki");
  return [...new Set(out)];
}

// ---------- keyword baseline (also the fallback when the LLM is unavailable) ----------
export function keywordIntent(text: string, catalog: LocationRef[]): Intent {
  const t = norm(text);
  const has = (...w: string[]) => w.some((x) => t.includes(norm(x)));
  const goal: Intent["goal"] = has("kafe aç", "aptek aç", "biznes", "aciram", "açmaq", "mağaza aç", "restoran aç", "obyekt aç", "open a", "start a", "business") ? "open_business" : has("kiray", "rent", "to let", "lease") ? "rent" : has("investis", "sərmayə", "gəlir gətir", "invest") ? "invest" : "buy";
  let budget: number | null = null;
  const bm = t.match(/(\d+[.,]?\d*)\s*(min|k|mln|milyon|million|m\b)?\s*(manat|azn|₼|\$|dollar)?/);
  if (bm && (bm[2] || bm[3])) {
    budget = parseFloat(bm[1].replace(",", ".")) * (bm[2] === "min" || bm[2] === "k" ? 1000 : bm[2] === "mln" || bm[2] === "milyon" || bm[2] === "million" || bm[2] === "m" ? 1e6 : 1);
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
  const business_type: Intent["business_type"] = goal !== "open_business" ? null : has("kafe", "restoran", "qəhvə", "cafe", "coffee", "restaurant") ? "cafe" : has("aptek", "pharmacy", "chemist") ? "pharmacy" : has("market", "ərzaq", "mağaza", "grocery", "shop") ? "grocery" : has("klinika", "stomatoloq", "clinic", "dentist") ? "clinic" : has("bağça") ? "kindergarten" : has("idman", "fitnes", "zal") ? "sport" : "other";
  const kids = has("uşaq", "ailə", "övlad", "kids", "children", "family");
  const missing: string[] = [];
  if (budget == null && goal !== "open_business") missing.push("budget_azn");
  if (!locs.length && !has("metro", "dağ", "dəniz", "kənar", "mountain", "sea", "coast", "outside baku")) missing.push("locations");
  return {
    goal,
    property_type: goal === "open_business" ? "obyekt" : has("torpaq", "sot", "land", "plot") ? "torpaq" : has("həyət", "bağ evi", "villa", "house with", "garden", "detached") ? "heyet_evi" : has("yeni tikili", "yeni bina", "new build", "new-build") ? "menzil_yeni" : "menzil_kohne",
    budget_azn: budget,
    desired_m2: m2m ? Number(m2m[1]) : null,
    locations_mentioned: [...new Set(locs)],
    hard_constraints: {
      metro_within_m: has("metro") ? 800 : null,
      school_within_m: has("məktəb", "school") ? 800 : null,
      kindergarten_within_m: has("bağça", "kindergarten", "nursery") && goal !== "open_business" ? 800 : null,
      park_within_m: has("park") ? 800 : null,
      max_price_m2: null,
      outside_baku: has("bakıdan kənar", "bakidan kenar", "rayonda", "kənddə", "outside baku", "countryside", "village"),
      mountain: has("dağ", "mountain"),
      coastal: has("dəniz", "sahil", "sea", "coast", "beach"),
    },
    business_type,
    soft_preferences: {
      rahatliq: 0.6,
      neqliyyat: has("metro", "nəqliyyat", "iş") ? 0.9 : 0.4,
      tehsil: kids || has("tələbə", "universitet") ? 1 : 0.1,
      sehiyye: has("təqaüd", "xəstəxana", "yaşlı") ? 1 : 0.3,
      tebiet: has("sakit", "təbiət", "hava", "dəniz", "yaşıl", "dağ", "quiet", "nature", "green", "sea", "mountain") ? 1 : 0.3,
      infrastruktur: 0.4,
      elcatanliq: has("ucuz", "büdcə", "qənaət", "cheap", "affordable", "budget") || budget ? 0.9 : 0.5,
    },
    household: kids ? "uşaqlı ailə" : has("tələbə", "student") ? "tələbə" : has("təqaüd", "retired", "pensioner") ? "təqaüdçü" : null,
    missing_critical_fields: missing,
  };
}

// ---------- retrieval ----------
export type Candidate = {
  rank: number;
  kind: "hex" | "region" | "settlement";
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

export function retrieve(intent: Intent, regions: Region[], hx: HexData, catalog: LocationRef[], st?: SettlementData, locale: string = "az"): Retrieval {
  const en = locale === "en";
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
    scope = en ? "Districts outside Baku" : "Bakıdan kənar rayonlar";
  } else {
    hexPool = hx.hexes.filter((h) => h.r.startsWith("bk-"));
    scope = en ? "Baku" : "Bakı";
  }

  // hard constraints, relaxed in reverse priority if nothing survives
  type Rule = { key: string; label: string; test: (x: Hex | Region) => boolean };
  const isHex = (x: Hex | Region): x is Hex => (x as Hex).h !== undefined;
  const rules: Rule[] = [];
  if (hc.metro_within_m) rules.push({ key: "metro", label: en ? `metro ≤${hc.metro_within_m} m` : `metroya ≤${hc.metro_within_m} m`, test: (x) => (isHex(x) ? (x.m ?? 9e9) <= hc.metro_within_m! : x.transport.metro > 0) });
  if (hc.school_within_m) rules.push({ key: "school", label: en ? `school ≤${hc.school_within_m} m` : `məktəbə ≤${hc.school_within_m} m`, test: (x) => (isHex(x) ? (x.sc ?? 9e9) <= hc.school_within_m! : (x.pois.school ?? 0) > 0) });
  if (hc.kindergarten_within_m) rules.push({ key: "kg", label: en ? `kindergarten ≤${hc.kindergarten_within_m} m` : `bağçaya ≤${hc.kindergarten_within_m} m`, test: (x) => (isHex(x) ? (x.k ?? 9e9) <= hc.kindergarten_within_m! : (x.pois.kindergarten ?? 0) > 0) });
  if (hc.park_within_m) rules.push({ key: "park", label: en ? `park ≤${hc.park_within_m} m` : `parka ≤${hc.park_within_m} m`, test: (x) => (isHex(x) ? (x.pk ?? 9e9) <= hc.park_within_m! : (x.pois.park ?? 0) > 0) });
  if (hc.mountain && mode === "region") rules.push({ key: "mountain", label: en ? "mountain/foothills" : "dağlıq/dağətəyi", test: (x) => !isHex(x) && (x.nature.terrain === "dağlıq" || x.nature.terrain === "dağətəyi") });
  if (hc.coastal) rules.push({ key: "coastal", label: en ? "near the coast" : "sahilə yaxın", test: (x) => (isHex(x) ? byId.get(x.r)?.nature.coastal ?? false : x.nature.coastal) });
  if (hc.max_price_m2) rules.push({ key: "maxprice", label: en ? `≤ AZN ${hc.max_price_m2}/m²` : `≤${hc.max_price_m2} ₼/m²`, test: (x) => { const p = price(isHex(x) ? x.r : x.id); return p == null || p <= hc.max_price_m2!; } });
  if (intent.budget_azn && intent.goal !== "open_business" && intent.goal !== "rent") rules.push({ key: "budget", label: en ? `budget AZN ${Math.round(intent.budget_azn / 1000)}k` : `büdcə ${Math.round(intent.budget_azn / 1000)} min ₼`, test: (x) => { const p = price(isHex(x) ? x.r : x.id); return p == null || p * size <= intent.budget_azn!; } });

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
        // pass 1: no two picks share a label or a nearest-metro area; pass 2: only labels must differ
        if (picks.some((p) => isHex(p.x) && p.x.l === hx2.l)) continue;
        if (distinctLabels && hx2.mn && (hx2.m ?? 9e9) < 1200 && picks.some((p) => isHex(p.x) && p.x.mn === hx2.mn && (p.x.m ?? 9e9) < 1200)) continue;
        if (!singleScope && (perReg[hx2.r] ?? 0) >= 2) continue;
        perReg[hx2.r] = (perReg[hx2.r] ?? 0) + 1;
      }
      picks.push(c);
    }
  }
  picks.sort((a, b) => b.s - a.s);
  // C2: outside the hex cities, turn the best rayons into concrete towns/villages (stats within 1.5 km)
  if (mode === "region" && st && !biz) {
    const top = scored.slice(0, 6);
    const sc = (c: string, x: Settlement) => x.p[st.cats.indexOf(c)] ?? 0;
    const local = (x: Settlement) => {
      const f: Record<IndexKey, number> = {
        rahatliq: clamp((sc("grocery", x) + sc("food", x) + sc("pharmacy", x) + sc("bank_atm", x)) / 12),
        tehsil: clamp((sc("school", x) + sc("kindergarten", x)) / 4),
        sehiyye: clamp((sc("hospital", x) + sc("clinic", x) + sc("pharmacy", x)) / 3),
        neqliyyat: x.s == null ? 0 : clamp(1 - (x.s - 300) / 1700),
        tebiet: 0.5 + 0.5 * clamp(sc("park", x) / 3),
        infrastruktur: 0.5,
        elcatanliq: 0.5,
      };
      let num = 0, den = 0;
      for (const k of Object.keys(f) as IndexKey[]) { num += (w[k] ?? 0) * f[k]; den += w[k] ?? 0; }
      return den ? (100 * num) / den : 50;
    };
    const setts = top.flatMap(({ x, s: rs }) => st.settlements.filter((z) => z.r === (x as Region).id).map((z) => ({ z, reg: x as Region, s: 0.55 * rs + 0.45 * local(z) })));
    if (setts.length >= 3) {
      setts.sort((a, b) => b.s - a.s);
      const per: Record<string, number> = {};
      const seenName = new Set<string>();
      const chosen = setts.filter((c) => !seenName.has(c.z.n + c.reg.id) && (seenName.add(c.z.n + c.reg.id), (per[c.reg.id] = (per[c.reg.id] ?? 0) + 1) <= 2)).slice(0, 5);
      const cands: Candidate[] = chosen.map(({ z, reg, s: sc2 }, i) => {
        const violations = rules.filter((r) => !r.test(reg)).map((r) => r.label);
        const pp = reg.prices[intent.property_type] ?? reg.prices.menzil_kohne;
        const n = (c: string) => z.p[st.cats.indexOf(c)] ?? 0;
        return {
          rank: i + 1, kind: "settlement", area_id: z.id, label: `${reg.name} · ${en && z.ne ? z.ne : z.n}`, region_id: reg.id, region_name: reg.name, centroid: z.c, score: Math.round(sc2), fits_constraints: !violations.length, violations,
          metrics: {
            settlement_type: z.t ? "şəhər/qəsəbə" : "kənd", radius_m: st.radius_m, grocery: n("grocery"), food: n("food"), pharmacy: n("pharmacy"), school: n("school"), kindergarten: n("kindergarten"), clinic: n("clinic") + n("hospital"), bus_stop_m: z.s,
            rayon_terrain: reg.nature.terrain, rayon_elevation_m: reg.nature.elev_mean, rayon_july_max_c: reg.climate.july_max_c, rayon_pm25: reg.air.pm25, rayon_coastal: reg.nature.coastal ? "bəli" : "xeyr",
            price_m2: pp?.value ?? null, price_confidence: pp?.confidence ?? null, osm_coverage: reg.coverage.osm,
          },
        };
      });
      return { mode, pool: filtered.length, candidates: cands, relaxed, scope: `${scope} · ${en ? "villages and settlements" : "kənd və qəsəbələr"}` };
    }
  }

  const candidates: Candidate[] = picks.map(({ x, s }, i) => {
    const violations = rules.filter((r) => !r.test(x)).map((r) => r.label);
    if (isHex(x)) {
      const reg = byId.get(x.r)!;
      const pp = reg.prices[intent.property_type] ?? reg.prices.menzil_kohne;
      const n = (c: string) => x.p[ci(c)] ?? 0;
      return {
        rank: i + 1, kind: "hex", area_id: x.h, label: en ? localizeLabel(x.l, "en") : x.l, region_id: reg.id, region_name: reg.name, centroid: x.c, score: Math.round(s), fits_constraints: !violations.length, violations,
        metrics: {
          nearest_metro: x.mn, metro_walk_m: x.m, bus_stop_m: x.s, school_m: x.sc, kindergarten_m: x.k, park_m: x.pk, rail_m: x.rl ?? null,
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
export function confidence(intent: Intent, r: Retrieval, locale: string = "az"): Confidence {
  const en = locale === "en";
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
    { key: "coverage", label: en ? "Data coverage" : "Məlumatın əhatəsi", weight: 40, value: coverage, note: en ? `OSM coverage ${Math.round(cov * 100)}%, price reliability ${Math.round(pr * 100)}% (demo prices count as low)` : `OSM əhatəsi ${Math.round(cov * 100)}%, qiymətlərin etibarlılığı ${Math.round(pr * 100)}% (demo qiymət aşağı sayılır)` },
    { key: "intent", label: en ? "Query completeness" : "Sorğunun tamlığı", weight: 25, value: completeness, note: en ? `${known.filter(Boolean).length}/${known.length} key fields known (location, budget, type)` : `${known.filter(Boolean).length}/${known.length} əsas sahə məlumdur (yer, büdcə, növ)` },
    { key: "margin", label: en ? "Gap between 1st and 2nd" : "Birinci ilə ikinci arasında fərq", weight: 20, value: margin, note: c.length >= 2 ? `${c[0].score} vs ${c[1].score} ${en ? "points" : "bal"}` : en ? "too few candidates to compare" : "müqayisə üçün namizəd azdır" },
    { key: "constraints", label: en ? "Match with constraints" : "Şərtlərə uyğunluq", weight: 15, value: cons, note: r.relaxed.length ? `${en ? "relaxed constraint" : "yumşaldılan şərt"}: ${r.relaxed.join(", ")}` : en ? `${Math.round(fits * 100)}% of candidates meet every constraint` : `${Math.round(fits * 100)}% namizəd bütün şərtlərə uyğundur` },
  ];
  const score = Math.round(parts.reduce((s, p) => s + p.weight * p.value, 0));
  return { score, label: score >= 70 ? "yüksək" : score >= 45 ? "orta" : "aşağı", parts };
}
