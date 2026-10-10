import type { Badge, Price, PropertyType, Region } from "./types";

// Locale-aware number formatting. LocaleSync sets the active locale before any component renders.
let NUM_LOCALE: "az" | "en" = "az";
export const setNumberLocale = (l: string) => { NUM_LOCALE = l === "en" ? "en" : "az"; };
export const getNumberLocale = () => NUM_LOCALE;
export const fmt = (v: number | null | undefined, digits = 0) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : NUM_LOCALE === "en"
      ? v.toLocaleString("en-GB", { maximumFractionDigits: digits, minimumFractionDigits: 0 })
      : v.toLocaleString("az-AZ", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).replace(/,/g, " ");

/** Money: "2 800 ₼" (az) / "AZN 2,800" (en); with a unit: "2 800 ₼/m²" / "AZN 2,800/m²". */
export const fmtAZN = (v: number | null | undefined, per = "") =>
  v == null ? "—" : NUM_LOCALE === "en" ? `AZN ${fmt(Math.round(v))}${per ? `/${per}` : ""}` : `${fmt(Math.round(v))} ₼${per ? `/${per}` : ""}`;

export const priceBadge = (p?: Price): Badge =>
  !p ? "mock" : p.confidence === "official" ? "official" : p.confidence === "estimate" ? "press" : p.confidence === "sample" ? "sample" : "mock";




// Sequential 5-step ramps (light → dark)
export const RAMPS = {
  caspian: ["#e4dccb", "#b8cdc8", "#7aa9b2", "#3d7a8c", "#0f4c5c"],
  pomegranate: ["#ebe0c9", "#e0bb9c", "#cc8a76", "#b25459", "#86203a"],
  green: ["#e6e0cc", "#c2d3b2", "#8db58f", "#4f8b69", "#1d5c42"],
};
export const NODATA = "#d3cbb8";

export type MetricKey = "fit" | "price" | "density" | "services" | "transport" | "paved" | "nature" | "air";
export type MetricCtx = { fit?: Record<string, number | null>; priceType: PropertyType };
/** Labels, units and notes live in messages under metrics.<key>.{label,unit,note}. */
export type Metric = {
  key: MetricKey;
  ramp: string[];
  get: (r: Region, ctx: MetricCtx) => number | null;
  badge: (r: Region, ctx: MetricCtx) => Badge;
  digits?: number;
  note?: boolean;
};

const SERVICE_KEYS = ["pharmacy", "grocery", "school", "kindergarten", "clinic", "hospital", "bank_atm", "food"];

export const METRICS: Metric[] = [
  {
    key: "fit",
    ramp: RAMPS.green,
    get: (r, c) => c.fit?.[r.id] ?? null,
    badge: () => "computed",
  },
  {
    key: "price",
    ramp: RAMPS.pomegranate,
    get: (r, c) => r.prices[c.priceType]?.value ?? r.prices.menzil_kohne?.value ?? null,
    badge: (r, c) => priceBadge(r.prices[c.priceType] ?? r.prices.menzil_kohne),
    note: true,
  },
  {
    key: "density",
    ramp: RAMPS.caspian,
    get: (r) => r.density.v,
    badge: () => "official",
  },
  {
    key: "services",
    ramp: RAMPS.caspian,
    digits: 1,
    get: (r) => {
      const vals = SERVICE_KEYS.map((k) => r.per10k[k]).filter((v): v is number => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
    },
    badge: () => "osm",
    note: true,
  },
  {
    key: "transport",
    ramp: RAMPS.caspian,
    get: (r) => r.indices.neqliyyat,
    badge: () => "computed",
  },
  {
    key: "paved",
    ramp: RAMPS.caspian,
    get: (r) => r.roads.paved_known_pct ?? null,
    badge: () => "osm",
    note: true,
  },
  {
    key: "nature",
    ramp: RAMPS.green,
    get: (r) => r.indices.tebiet,
    badge: () => "computed",
  },
  {
    key: "air",
    ramp: RAMPS.pomegranate,
    digits: 1,
    get: (r) => r.air.pm25,
    badge: () => "model",
    note: true,
  },
];

/** Quantile breaks (5 classes) over non-null values. */
export function quantileBreaks(values: (number | null)[]): number[] {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return [];
  const b = [0.2, 0.4, 0.6, 0.8].map((q) => v[Math.min(v.length - 1, Math.floor(q * v.length))]);
  return b.filter((x, i) => i === 0 || x !== b[i - 1]); // drop duplicate breaks when few distinct values
}
/** Colors actually used for the given breaks (spread over the ramp when there are fewer than 4 breaks). */
export const rampFor = (breaks: number[], ramp: string[]) =>
  Array.from({ length: breaks.length + 1 }, (_, i) => ramp[breaks.length ? Math.round((i * (ramp.length - 1)) / breaks.length) : ramp.length - 1]);
export function classify(v: number | null, breaks: number[], ramp: string[]) {
  if (v == null) return NODATA;
  let i = 0;
  while (i < breaks.length && v > breaks[i]) i++;
  return rampFor(breaks, ramp)[i];
}
