// Contract between the data pipeline (public/data/*) and the UI. Change deliberately.

export type Badge = "osm" | "official" | "computed" | "sample" | "mock" | "model" | "press";
export type Val = { v: number | null; badge: Badge };

export type PropertyType = "menzil_yeni" | "menzil_kohne" | "heyet_evi" | "obyekt" | "torpaq";
export type Price = {
  value: number | null;
  unit: "AZN_m2" | "AZN_sot";
  n: number;
  source: string;
  source_url?: string;
  confidence: "official" | "sample" | "estimate" | "mock";
};

export type IndexKey =
  | "rahatliq"
  | "neqliyyat"
  | "tehsil"
  | "sehiyye"
  | "tebiet"
  | "infrastruktur"
  | "elcatanliq";

export type CategoryTag =
  | "aile_dostu"
  | "genc_pesekar"
  | "telebe"
  | "teqaudcu"
  | "biznes_furseti"
  | "tebiet_sakitlik"
  | "budce_dostu"
  | "premium"
  | "inkisafda"
  | "turizm";

export interface AIProfile {
  headline: string;
  tags: { tag: CategoryTag; reason: string }[];
  summary: string;
  strengths: string[];
  weaknesses: string[];
  best_for: string[];
  watch_out: string[];
  confidence_note: string;
}

export type Level = "rayon" | "baku_district";

export interface Region {
  id: string;
  name: string;
  level: Level;
  parent_id?: string;
  centroid: [number, number];
  area_km2: number;
  population: Val;
  density: Val;
  pois: Record<string, number>;
  per10k: Record<string, number | null>;
  transport: {
    metro: number;
    rail: number;
    bus_stops: number;
    bus_routes: number;
    nearest_metro_km?: number | null;
    route_refs?: string[];
  };
  roads: { total_km: number; paved_pct: number | null; unpaved_pct: number | null; unknown_pct: number | null; paved_known_pct?: number | null };
  nature: {
    elev_mean: number | null;
    elev_min: number | null;
    elev_max: number | null;
    ruggedness: number | null;
    terrain: "düzənlik" | "dağətəyi" | "dağlıq" | null;
    coastal: boolean;
    landcover: Record<string, number>;
  };
  climate: { july_max_c: number | null; jan_min_c: number | null; precip_mm: number | null };
  air: { pm25: number | null };
  prices: Partial<Record<PropertyType, Price>>;
  indices: Record<IndexKey, number | null>;
  coverage: { osm: "yüksək" | "orta" | "aşağı"; prices: "official" | "sample" | "estimate" | "mock" | "none"; per_capita?: "ok" | "unreliable"; note?: string; note_en?: string };
  listings?: { n: number; deed_share: number; mortgage_share: number; period: string };
  /** opendata.az (official) — shown next to OSM, never merged into OSM counts */
  official?: {
    metro?: { name: string; pax_weekday: number | null }[];
    poi?: Record<string, { osm: number; official: number }>;
    roads?: { km: number; year: number; first_km: number; first_year: number; density: number | null };
    rail_m?: number | null;
    boundary?: { iou: number | null; replaced?: boolean };
  };
  ai?: AIProfile;
  ai_en?: AIProfile;
}

export interface National {
  level: Level;
  label: string;
  bus_routes: number | null;
  per10k: Record<string, number | null>;
  indices: Record<IndexKey, number | null>;
  prices: Partial<Record<PropertyType, number | null>>;
  density: number | null;
  paved_pct: number | null;
  pm25: number | null;
}

export const POI_CATS = [
  "pharmacy",
  "grocery",
  "mall",
  "bazaar",
  "food",
  "school",
  "kindergarten",
  "university",
  "hospital",
  "clinic",
  "bank_atm",
  "fuel",
  "sport",
  "park",
] as const;
export type PoiCat = (typeof POI_CATS)[number];
