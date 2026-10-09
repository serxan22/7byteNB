import type { Badge, Price, PropertyType, Region } from "./types";

export const fmt = (v: number | null | undefined, digits = 0) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("az-AZ", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).replace(/,/g, " ");

export const fmtAZN = (v: number | null | undefined) => (v == null ? "—" : `${fmt(Math.round(v))} ₼`);

export const BADGE_LABEL: Record<Badge, string> = {
  osm: "Canlı (OSM)",
  official: "Rəsmi (DSK)",
  computed: "Hesablanıb",
  sample: "Nümunə",
  mock: "Demo",
  model: "Model",
  press: "Mətbuat",
};
export const BADGE_HINT: Record<Badge, string> = {
  osm: "OpenStreetMap-dən sayılıb; xəritələnməyən obyektlər görünmür",
  official: "Dövlət Statistika Komitəsi, 01.01.2026",
  computed: "Bu saytda digər göstəricilərdən hesablanıb",
  sample: "Elan nümunələrinin medianı",
  mock: "Demo dəyər — real mənbə hələ yoxdur",
  model: "Model təxmini (ölçmə deyil)",
  press: "Dərc olunmuş xəbər/icmal rəqəmi (təxmini)",
};

export const priceBadge = (p?: Price): Badge =>
  !p ? "mock" : p.confidence === "official" ? "official" : p.confidence === "estimate" ? "press" : p.confidence === "sample" ? "sample" : "mock";

export const PROPERTY_LABEL: Record<PropertyType, string> = {
  menzil_yeni: "Yeni tikili",
  menzil_kohne: "Köhnə tikili",
  heyet_evi: "Həyət evi",
  obyekt: "Obyekt (kommersiya)",
  torpaq: "Torpaq",
};

export const POI_LABEL: Record<string, string> = {
  pharmacy: "Aptek",
  grocery: "Ərzaq mağazası",
  mall: "Ticarət mərkəzi",
  bazaar: "Bazar",
  food: "Kafe / restoran",
  school: "Məktəb",
  kindergarten: "Uşaq bağçası",
  university: "Universitet / kollec",
  hospital: "Xəstəxana",
  clinic: "Poliklinika / həkim",
  bank_atm: "Bank / bankomat",
  fuel: "Yanacaq doldurma",
  sport: "İdman",
  park: "Park",
  bus_stops: "Avtobus dayanacağı",
};

export const INDEX_LABEL: Record<string, string> = {
  rahatliq: "Gündəlik rahatlıq",
  neqliyyat: "Nəqliyyat",
  tehsil: "Təhsil",
  sehiyye: "Səhiyyə",
  tebiet: "Təbiət",
  infrastruktur: "Yol infrastrukturu",
  elcatanliq: "Əlçatanlıq (qiymət)",
};

// Sequential 5-step ramps (light → dark)
export const RAMPS = {
  caspian: ["#e4dccb", "#b8cdc8", "#7aa9b2", "#3d7a8c", "#0f4c5c"],
  pomegranate: ["#ebe0c9", "#e0bb9c", "#cc8a76", "#b25459", "#86203a"],
  green: ["#e6e0cc", "#c2d3b2", "#8db58f", "#4f8b69", "#1d5c42"],
};
export const NODATA = "#d3cbb8";

export type MetricKey = "fit" | "price" | "density" | "services" | "transport" | "paved" | "nature" | "air";
export type MetricCtx = { fit?: Record<string, number | null>; priceType: PropertyType };
export type Metric = {
  key: MetricKey;
  label: string;
  unit: string;
  ramp: string[];
  get: (r: Region, ctx: MetricCtx) => number | null;
  badge: (r: Region, ctx: MetricCtx) => Badge;
  digits?: number;
  note?: string;
};

const SERVICE_KEYS = ["pharmacy", "grocery", "school", "kindergarten", "clinic", "hospital", "bank_atm", "food"];

export const METRICS: Metric[] = [
  {
    key: "fit",
    label: "Uyğunluq",
    unit: "/100",
    ramp: RAMPS.green,
    get: (r, c) => c.fit?.[r.id] ?? null,
    badge: () => "computed",
  },
  {
    key: "price",
    label: "Mənzil qiyməti",
    unit: "₼/m²",
    ramp: RAMPS.pomegranate,
    get: (r, c) => r.prices[c.priceType]?.value ?? r.prices.menzil_kohne?.value ?? null,
    badge: (r, c) => priceBadge(r.prices[c.priceType] ?? r.prices.menzil_kohne),
    note: "Qiymət yalnız 19 ərazi üçün var; çoxu demo dəyərdir",
  },
  {
    key: "density",
    label: "Əhali sıxlığı",
    unit: "nəfər/km²",
    ramp: RAMPS.caspian,
    get: (r) => r.density.v,
    badge: () => "official",
  },
  {
    key: "services",
    label: "Xidmətlər",
    unit: "obyekt / 10 min sakin",
    ramp: RAMPS.caspian,
    digits: 1,
    get: (r) => {
      const vals = SERVICE_KEYS.map((k) => r.per10k[k]).filter((v): v is number => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
    },
    badge: () => "osm",
    note: "Aptek, ərzaq, məktəb, bağça, poliklinika, xəstəxana, bank, kafe — OSM-də xəritələnənlər",
  },
  {
    key: "transport",
    label: "Nəqliyyat",
    unit: "indeks 0–100",
    ramp: RAMPS.caspian,
    get: (r) => r.indices.neqliyyat,
    badge: () => "computed",
  },
  {
    key: "paved",
    label: "Asfalt yollar",
    unit: "% (örtüyü məlum yollar)",
    ramp: RAMPS.caspian,
    get: (r) => r.roads.paved_known_pct ?? null,
    badge: () => "osm",
    note: "Örtüyü OSM-də qeyd olunmayan yollar hesaba alınmır",
  },
  {
    key: "nature",
    label: "Təbiət",
    unit: "indeks 0–100",
    ramp: RAMPS.green,
    get: (r) => r.indices.tebiet,
    badge: () => "computed",
  },
  {
    key: "air",
    label: "Hava (PM2.5)",
    unit: "µg/m³",
    ramp: RAMPS.pomegranate,
    digits: 1,
    get: (r) => r.air.pm25,
    badge: () => "model",
    note: "CAMS modeli, son 30 gün; ÜST tövsiyəsi 5 µg/m³",
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
