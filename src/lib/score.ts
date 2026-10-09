// Pure scoring functions shared by scripts/build-data.mjs (Node type-stripping) and the UI.
import type { IndexKey, PropertyType, Region } from "./types.ts";

export const INDEX_KEYS: IndexKey[] = [
  "rahatliq",
  "neqliyyat",
  "tehsil",
  "sehiyye",
  "tebiet",
  "infrastruktur",
  "elcatanliq",
];

/** Percentile rank (0–100) of x within values (nulls ignored). */
export function pctRank(values: (number | null | undefined)[], x: number | null | undefined): number | null {
  if (x == null || !Number.isFinite(x)) return null;
  const v = values.filter((n): n is number => n != null && Number.isFinite(n));
  if (v.length < 2) return null;
  let below = 0,
    equal = 0;
  for (const n of v) {
    if (n < x) below++;
    else if (n === x) equal++;
  }
  return Math.round(((below + 0.5 * equal) / v.length) * 100);
}

const mean = (xs: (number | null)[]) => {
  const v = xs.filter((n): n is number => n != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};

export function mainPrice(r: Region, type: PropertyType = "menzil_kohne"): number | null {
  return r.prices[type]?.value ?? r.prices.menzil_kohne?.value ?? null;
}

/** Computes the 7 indices for all regions of one level (percentiles within that level). */
export function computeIndices(regions: Region[], priceType: PropertyType = "menzil_kohne"): Record<string, Record<IndexKey, number | null>> {
  const col = (f: (r: Region) => number | null | undefined) => regions.map(f);
  const p = (f: (r: Region) => number | null | undefined, invert = false) => {
    const vals = col(f).map((v) => (v == null ? null : invert ? -v : v));
    return (r: Region) => {
      const x = f(r);
      return pctRank(vals, x == null ? null : invert ? -x : x);
    };
  };
  const per = (k: string) => p((r) => r.per10k[k]);
  const g = {
    grocery: per("grocery"),
    pharmacy: per("pharmacy"),
    food: per("food"),
    mall: per("mall"),
    bank: per("bank_atm"),
    school: per("school"),
    kg: per("kindergarten"),
    uni: per("university"),
    hosp: per("hospital"),
    clinic: per("clinic"),
    stops: per("bus_stops"),
    routes: p((r) => r.transport.bus_routes),
    metro: p((r) => r.transport.metro),
    metroKm: p((r) => r.transport.nearest_metro_km ?? null, true),
    green: p((r) => {
      const lc = r.nature.landcover;
      if (!lc || !Object.keys(lc).length) return null;
      return (lc.forest ?? 0) + (lc.water ?? 0) + (lc.grass ?? 0) + (lc.park ?? 0);
    }),
    pm: p((r) => r.air.pm25, true),
    paved: p((r) => r.roads.paved_known_pct ?? null),
    unpaved: p((r) => r.roads.unpaved_pct, true),
    price: p((r) => mainPrice(r, priceType), true),
  };
  const out: Record<string, Record<IndexKey, number | null>> = {};
  for (const r of regions) {
    const hasMetroNet = regions.some((x) => x.transport.metro > 0);
    let tebiet = mean([g.green(r), g.pm(r)]);
    if (tebiet != null && r.nature.coastal) tebiet = Math.min(100, tebiet + 10);
    out[r.id] = {
      rahatliq: mean([g.grocery(r), g.pharmacy(r), g.food(r), g.mall(r), g.bank(r)]),
      neqliyyat: mean([g.stops(r), g.routes(r), hasMetroNet ? g.metro(r) : null, g.metroKm(r)]),
      tehsil: mean([g.school(r), g.kg(r), g.uni(r)]),
      sehiyye: mean([g.hosp(r), g.clinic(r), g.pharmacy(r)]),
      tebiet,
      infrastruktur: mean([g.paved(r), g.unpaved(r)]),
      elcatanliq: g.price(r),
    };
  }
  return out;
}

export type Persona = {
  property_type: PropertyType;
  budget_azn: number | null;
  desired_m2: number | null;
  work_hub_id: string | null;
  mode: "metro" | "bus" | "car" | "walk";
  weights: Record<IndexKey, number>;
  hard_requirements: string[];
  summary_az: string;
};

export type FitResult = { id: string; fit: number | null; overBudget: boolean; price: number | null };

/** Fit = Σ(w·index)/Σw over available indices (+ commute to work hub, weight 0.8); over-budget regions ×0.3. */
export function fitScore(r: Region, persona: Persona, hub?: [number, number] | null): FitResult {
  let num = 0,
    den = 0;
  if (hub) {
    const km = haversineKm(r.centroid, hub) * 1.4;
    const commute = Math.max(0, 100 - km * 3.5); // ~29 km road distance → 0
    num += 0.8 * commute;
    den += 0.8;
  }
  for (const k of INDEX_KEYS) {
    const w = persona.weights[k] ?? 0;
    // missing data must not help a region rank first: unknown index counts as a conservative 30
    const v = r.indices[k] ?? 30;
    if (w > 0) {
      num += w * v;
      den += w;
    }
  }
  const price = r.prices[persona.property_type]?.value ?? null;
  let fit = den > 0 ? num / den : null;
  const size = persona.property_type === "torpaq" ? persona.desired_m2 ?? null : persona.desired_m2 ?? 70;
  const overBudget = !!(persona.budget_azn && price && size && price * size > persona.budget_azn);
  if (fit != null && overBudget) fit *= 0.3;
  return { id: r.id, fit: fit == null ? null : Math.round(fit), overBudget, price };
}

const SIM_KEYS: IndexKey[] = ["rahatliq", "neqliyyat", "tehsil", "sehiyye", "tebiet", "infrastruktur"];

/** Top-3 regions with cosine-similar index profiles that are cheaper. */
export function similarCheaper(target: Region, all: Region[], type: PropertyType = "menzil_kohne") {
  const vec = (r: Region) => SIM_KEYS.map((k) => r.indices[k] ?? 50);
  const a = vec(target);
  const na = Math.hypot(...a);
  const tp = mainPrice(target, type);
  return all
    .filter((r) => r.id !== target.id && r.level === target.level)
    .map((r) => {
      const b = vec(r);
      const sim = a.reduce((s, x, i) => s + x * b[i], 0) / (na * Math.hypot(...b) || 1);
      return { region: r, sim, price: mainPrice(r, type) };
    })
    .filter((x) => x.price != null && (tp == null || x.price < tp))
    .sort((x, y) => y.sim - x.sim)
    .slice(0, 3);
}

export function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371,
    toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]),
    dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 10-year true cost: purchase + 120 months × (transport + commute time value). "təxmini model". */
export function trueCost(opts: {
  price_m2: number;
  m2: number;
  from: [number, number];
  to: [number, number];
  mode: "metro" | "bus" | "car" | "walk";
  intercity: boolean;
  monthly_transport_azn: number;
  hourly_value_azn: number;
  trips_per_month?: number;
}) {
  const km = haversineKm(opts.from, opts.to) * 1.4;
  const speed = opts.mode === "metro" ? 30 : opts.mode === "bus" ? 15 : opts.mode === "walk" ? 5 : opts.intercity ? 60 : 25;
  const oneWayH = km / speed;
  const trips = opts.trips_per_month ?? 44; // 22 workdays × 2
  const commuteH = oneWayH * trips;
  const purchase = opts.price_m2 * opts.m2;
  const monthly = opts.monthly_transport_azn + commuteH * opts.hourly_value_azn;
  return {
    km: Math.round(km * 10) / 10,
    oneWayMin: Math.round(oneWayH * 60),
    commuteHoursMonth: Math.round(commuteH),
    purchase: Math.round(purchase),
    living10y: Math.round(120 * monthly),
    total: Math.round(purchase + 120 * monthly),
  };
}

const GAP_CATS: Record<string, string> = {
  pharmacy: "aptek",
  grocery: "ərzaq mağazası",
  school: "məktəb",
  kindergarten: "uşaq bağçası",
  clinic: "poliklinika/həkim",
  bank_atm: "bank/bankomat",
  sport: "idman zalı",
  food: "kafe/restoran",
};

/** Residents per facility vs level median; ratio > 1.5 and population > 10k → top 3 gaps. */
export function businessGaps(r: Region, all: Region[]) {
  const pop = r.population.v;
  if (!pop || pop < 10000) return [];
  const peers = all.filter((x) => x.level === r.level && x.population.v);
  const out: { cat: string; label: string; perFacility: number; median: number; ratio: number }[] = [];
  for (const [cat, label] of Object.entries(GAP_CATS)) {
    const vals = peers
      .map((x) => (x.pois[cat] ? x.population.v! / x.pois[cat] : null))
      .filter((n): n is number => n != null)
      .sort((a, b) => a - b);
    if (vals.length < 3) continue;
    const median = vals[Math.floor(vals.length / 2)];
    const count = r.pois[cat] ?? 0;
    const perFacility = count ? pop / count : pop;
    const ratio = perFacility / median;
    if (ratio > 1.5) out.push({ cat, label, perFacility: Math.round(perFacility), median: Math.round(median), ratio: Math.round(ratio * 10) / 10 });
  }
  return out.sort((a, b) => b.ratio - a.ratio).slice(0, 3);
}
