# MƏSKƏN — Product & Build Spec

## 1. Product in one paragraph
A clean, beautiful **2D map of Azerbaijan** (no cluttered street basemap) where every rayon/city — and every Baku district — is a coloured region. A person buying a flat, a courtyard house, a commercial property or land picks an area and instantly sees: property prices by type, services (pharmacies, shops, food, malls, schools, universities, hospitals), transport (metro, bus/marshrut routes, stops), road quality (asphalt vs unpaved), nature (elevation, terrain, land cover, climate, air quality), population density — as **charts, not just text**. Below the stats, an **AI Analyst** section categorises the area, explains strengths/weaknesses, and gives personalised advice. The user can describe their life in one sentence and the whole map recolours by personal fit.

**Pitch line:** "Bakıda və ya regionda ev alan insan 3 şeyi bilmir: hansı ərazi ona uyğundur, evin real qiyməti nədir, alışda hüquqi risk nədir. Məskən üçünə də cavab verir."

---

## 2. Feature list (priority order — build in this order, cut from the bottom)

| # | Feature | Must/Should |
|---|---|---|
| F1 | 2D choropleth map of AZ (rayon level) + Baku district level, metric switcher, hover tooltip, click → side panel | MUST |
| F2 | Region panel with stat tabs and charts (see §6) + source badges | MUST |
| F3 | AI Analyst section per region: category tags, summary, strengths/weaknesses, best-for, watch-outs, confidence note (precomputed) | MUST |
| F4 | Persona mode: free-text life description → AI weights → map recolours by personal fit, TOP-5 list | MUST |
| F5 | "Ərazi DNT-si" radar chart (7 indices) + "Oxşar, amma ucuz" — 3 most similar regions by index vector with lower price | SHOULD |
| F6 | True cost calculator (10-year: price + commute money + commute time) for 2–3 regions | SHOULD |
| F7 | Legal check: paste a listing text → red flags + due-diligence checklist | SHOULD |
| F8 | Compare page: 2–3 regions side by side (grouped bar charts) | SHOULD |
| F9 | Business gap finder: categories under-supplied relative to population | NICE |
| F10 | `/menbeler` page: every dataset, source URL, date, coverage, method | MUST (cheap, judges love it) |

---

## 3. Data — sources, method, output

### 3.1 Principle
- **Primary bulk source: OpenStreetMap via Geofabrik extract** (one download, offline processing, no rate limits):
  `https://download.geofabrik.de/asia/azerbaijan-latest.osm.pbf`
  Process with `osmium-tool` (CLI: `osmium tags-filter`, `osmium export -f geojsonseq`). If osmium cannot be installed, fall back to Overpass API using `scripts/fetch-osm-quick.mjs` (already written — reuse it, extend categories).
- **Official statistics: Dövlət Statistika Komitəsi (stat.gov.az).** Try to download the relevant XLS tables; if blocked or unparseable within 15 min → create manual CSV template (§3.3).
- **Open-Meteo APIs (free, no key)** for elevation, climate, air quality.
- **Google Places API (New)** — OPTIONAL, only if `GOOGLE_MAPS_API_KEY` is set. Use live (on region open) for enrichment like top-rated places; do not bulk-store Google content beyond place_id (ToS). If no key → skip silently, OSM is enough.
- **Yandex Maps, Waze, 2GIS:** do NOT use. No public data API for this purpose / terms forbid harvesting. Mention in `/menbeler` as "gələcəkdə tərəfdaşlıq ilə".
- **Prices:** no public API exists. Use official/bank reports + manual listing samples (§3.3). Never scrape listing sites.

### 3.2 Datasets to produce

**A. Boundaries** — OSM `boundary=administrative` inside AZ.
- Level "rayon/şəhər" (≈60–80 units, find the right admin_level by counting) and level "Bakı rayonları" (12 units).
- Simplify geometry (`@turf/simplify`, tolerance tuned so `public/data/regions-az.geojson` < 1.5 MB, `regions-baku.geojson` < 0.5 MB).
- Name normalisation helper: strip "rayonu/şəhəri", unify Latin/Cyrillic/English variants, alias table in `data/manual/name-aliases.json` — needed to join DSK and price data.

**B. POIs (counts per region + per 10k residents)** — OSM tags:
| Key | OSM selector |
|---|---|
| pharmacy | amenity=pharmacy |
| grocery | shop=supermarket\|convenience\|greengrocer |
| mall | shop=mall; also amenity=marketplace (bazar) as separate `bazaar` |
| food | amenity=restaurant\|cafe\|fast_food |
| school | amenity=school |
| kindergarten | amenity=kindergarten |
| university | amenity=university\|college |
| hospital | amenity=hospital |
| clinic | amenity=clinic\|doctors |
| bank_atm | amenity=bank\|atm |
| fuel | amenity=fuel |
| sport | leisure=sports_centre\|fitness_centre\|stadium |
| park | leisure=park |
Use node/way/relation centroids. Also export Baku POIs as a compact point file (`public/data/pois-baku.json`: `[lon,lat,catIndex]` arrays) for a zoomed dot layer.

**C. Transport**
- Metro stations: `station=subway` (Baku), rail stations: `railway=station` (non-subway).
- Bus stops: `highway=bus_stop`.
- Bus/marshrut routes: relations `type=route` + `route=bus|minibus|share_taxi` → count of distinct routes intersecting each region, plus route list (ref + name) for Baku districts.
- Distance from region centroid to nearest metro station (km) for Baku districts.

**D. Roads & surface**
- Ways with `highway` in primary|secondary|tertiary|unclassified|residential|living_street|track.
- Length per region (`@turf/length` after clipping or by assigning each way to the region containing its midpoint — midpoint is fine and much faster).
- Bucket by `surface`: asphalt/concrete/paved/paving_stones → `paved`; unpaved/dirt/ground/gravel/compacted/sand/grass → `unpaved`; missing → `unknown` (but `highway=track` without surface → `unpaved`).
- Output: `total_km, paved_pct, unpaved_pct, unknown_pct`. Show unknown honestly.

**E. Nature & terrain**
- Land cover share (% of region area) from OSM polygons: forest/wood, farmland/orchard/vineyard, water/wetland, beach/sand, residential, industrial, meadow/grassland/scrub, other. Area via `@turf/area` on polygons whose centroid is in region (approximation is fine — label "təxmini").
- Elevation: Open-Meteo Elevation API `https://api.open-meteo.com/v1/elevation?latitude=..&longitude=..` (up to 100 coords per call). Sample a 5×5 grid inside each region bbox (keep points inside polygon). Output mean/min/max and ruggedness (std dev). Terrain label: düzənlik (<200 m & std<50), dağətəyi, dağlıq (mean>1000 or std>250).
- Coast: distance from centroid to Caspian coastline (`natural=coastline`) — flag `sahilyanı` if < 5 km.
- Climate (centroid): Open-Meteo archive API `https://archive-api.open-meteo.com/v1/archive` daily for last full year → avg July max °C, avg January min °C, annual precipitation mm.
- Air quality (centroid): Open-Meteo `https://air-quality-api.open-meteo.com/v1/air-quality` hourly pm2_5 for the last 30 days → mean. Label as "model qiymətləndirməsi (CAMS)".
- Batch all Open-Meteo calls, ≤ 5 req/sec, cache every response file in `data/raw/openmeteo/`.

**F. Official statistics (stat.gov.az)** — per rayon/city:
- population (latest year), area km², → density.
- If available within the time box: average monthly nominal wage by region, housing stock per capita.
- Store with `source_url` and `year`.

**G. Prices** — `data/manual/prices.csv` (human fills; you create template + import script):
```
region_id,region_name,property_type,value,unit,n_samples,source,source_url,collected_at,confidence
```
- `property_type`: `menzil_yeni` (yeni tikili), `menzil_kohne` (köhnə tikili), `heyet_evi`, `obyekt` (kommersiya), `torpaq`.
- `unit`: `AZN_m2` (flats, houses, commercial) or `AZN_sot` (land).
- `confidence`: `official` (bank/Central Bank report) | `sample` (median of manual listing samples, n≥8) | `estimate`.
- Baku-wide reference: ABB Bank real-estate reports (abb-bank.az → Araşdırmalar) and Central Bank reviews — human extracts numbers.
- Pre-fill the template with all Baku districts + 6 cities (Gəncə, Sumqayıt, Mingəçevir, Lənkəran, Şəki, Quba) × 5 types, values empty.

**H. Legal corpus** — `data/legal/*.md`: human pastes relevant articles from e-qanun.az (Mülki Məcəllə — daşınmaz əmlak alqı-satqısı; daşınmaz əmlakın dövlət reyestri haqqında qanun). The legal-check prompt includes these texts; if folder empty, AI gives checklist without article numbers.

### 3.3 Manual data protocol
When a manual file is needed: create it with headers + prefilled region rows, print ONE message: file path, what to fill, which source, how many minutes it takes. Continue with other phases using clearly-flagged mock values (`confidence: "mock"`, UI badge "Demo") until real values arrive; the import script must replace them with zero code changes.

### 3.4 Build output
`scripts/build-data.mjs` joins everything into:
- `public/data/regions-az.json` and `public/data/regions-baku.json` — arrays of `Region` (types below), WITHOUT geometry.
- `public/data/regions-az.geojson`, `regions-baku.geojson` — geometry + `id` only.
- `public/data/national.json` — national medians for each metric (for "vs Azərbaycan ortası" bars).
- `data/processed/sources.json` — list of datasets: name, url, fetched_at, status, coverage note.
Total `public/data` < 4 MB.

---

## 4. Tech stack (only these)
- Next.js (App Router) + TypeScript + Tailwind CSS
- `maplibre-gl` (map, GeoJSON source, no third-party tiles required) — load client-side via dynamic import
- `recharts` (bar, radar, donut charts)
- `zod` (schema validation of data files and AI output)
- `@anthropic-ai/sdk` (AI) — models via env: `AI_MODEL` (default `claude-sonnet-5-5`) for live features, `AI_BATCH_MODEL` (default `claude-haiku-5-5`) for precomputing profiles
- Data scripts: `osmtogeojson`, `@turf/*` (area, bbox, boolean-point-in-polygon, centroid, simplify, length, distance, helpers), `xlsx` (for DSK tables), `csv-parse`
- System tool: `osmium-tool`
- Deploy: Vercel. Env: `ANTHROPIC_API_KEY`, optional `GOOGLE_MAPS_API_KEY`, `AI_MODEL`, `AI_BATCH_MODEL`.

---

## 5. Data contract — `src/lib/types.ts`
```ts
export type Badge = "osm" | "official" | "computed" | "sample" | "mock" | "model";
export type Val = { v: number | null; badge: Badge };

export type PropertyType = "menzil_yeni" | "menzil_kohne" | "heyet_evi" | "obyekt" | "torpaq";
export type Price = { value: number | null; unit: "AZN_m2" | "AZN_sot"; n: number; source: string;
                      source_url?: string; confidence: "official" | "sample" | "estimate" | "mock" };

export type IndexKey = "rahatliq" | "neqliyyat" | "tehsil" | "sehiyye" | "tebiet" | "infrastruktur" | "elcatanliq";
// rahatliq=daily convenience (grocery, pharmacy, food, mall, bank)
// elcatanliq=affordability (inverse of price)

export interface Region {
  id: string; name: string; level: "rayon" | "baku_district"; parent_id?: string;
  centroid: [number, number]; area_km2: number;
  population: Val; density: Val;
  pois: Record<string, number>;          // counts
  per10k: Record<string, number | null>; // per 10k residents
  transport: { metro: number; rail: number; bus_stops: number; bus_routes: number;
               nearest_metro_km?: number; route_refs?: string[] };
  roads: { total_km: number; paved_pct: number; unpaved_pct: number; unknown_pct: number };
  nature: { elev_mean: number | null; elev_min: number | null; elev_max: number | null;
            ruggedness: number | null; terrain: "düzənlik" | "dağətəyi" | "dağlıq" | null;
            coastal: boolean; landcover: Record<string, number> };
  climate: { july_max_c: number | null; jan_min_c: number | null; precip_mm: number | null };
  air: { pm25: number | null };
  prices: Partial<Record<PropertyType, Price>>;
  indices: Record<IndexKey, number>;      // 0–100, percentile within same level
  coverage: { osm: "yüksək" | "orta" | "aşağı"; prices: "official" | "sample" | "mock" | "none" };
  ai?: AIProfile;
}

export type CategoryTag = "aile_dostu" | "genc_pesekar" | "telebe" | "teqaudcu" | "biznes_furseti"
  | "tebiet_sakitlik" | "budce_dostu" | "premium" | "inkisafda" | "turizm";

export interface AIProfile {
  headline: string;                 // ≤ 12 words
  tags: { tag: CategoryTag; reason: string }[];  // 2–4
  summary: string;                  // 3–5 sentences
  strengths: string[]; weaknesses: string[];     // 3 each, each citing a metric
  best_for: string[]; watch_out: string[];
  confidence_note: string;          // mentions coverage/mock data honestly
}
```

---

## 6. UI / UX

### 6.1 Visual direction (visual quality is a primary judging factor)
- Flat, editorial "data-journalism" look. NO detailed street basemap: the map is the regions themselves on a calm background, thin white borders, soft shadows, region labels at sensible zoom. Optional light raster basemap toggle only when zoomed into Baku.
- Palette inspired by Azerbaijan's landscape: Caspian deep blue (primary), Absheron sand (background/neutral), Caucasus green (good), pomegranate red (risk). Sequential colour scale for choropleth (5 steps), diverging only for "vs national average".
- Typography must support ə ğ ı ş ç ö ü (e.g. Manrope or Inter via `next/font`). Big confident numbers in KPI tiles.
- Light and dark mode. Mobile: map on top, panel as bottom sheet.
- Subtle motion: region fill transitions when metric/persona changes (this is the demo "wow" moment — make it smooth).

### 6.2 Layout (single main page `/`)
- **Top bar:** logo "Məskən", persona input ("Həyatını bir cümlə ilə təsvir et…") with 3 example chips, level switch (Azərbaycan / Bakı), link to Müqayisə and Mənbələr.
- **Map (left/center, ~60%):** metric chips — Uyğunluq (only after persona), Mənzil qiyməti, Əhali sıxlığı, Xidmətlər, Nəqliyyat, Asfalt yollar %, Təbiət, Hava keyfiyyəti. Legend with real units. Hover tooltip: name + current metric + badge. Click → select & zoom.
- **Side panel (right, ~40%) for selected region:**
  1. Header: name, terrain label, coastal flag, category tag chips (from AI), coverage warning if low.
  2. KPI tiles row: əhali, sıxlıq/km², orta m² qiyməti, metro/dayanacaq, asfalt %.
  3. Tabs, each with charts:
     - **Qiymətlər** — horizontal bar chart per property type (AZN/m², land AZN/sot shown separately), badge per bar, vs national median marker.
     - **Xidmətlər** — bar chart per10k for each POI category vs national median (diverging colour), raw counts in tooltip.
     - **Nəqliyyat** — metro, rail, bus stops, route count tiles; nearest metro km; route refs chips (Baku).
     - **Yollar** — stacked bar paved / unpaved / unknown + total km.
     - **Təbiət** — donut of land cover, elevation min/mean/max bar, climate tiles (July max, Jan min, precipitation), PM2.5 tile with WHO guideline reference line (5 µg/m³ annual).
     - **DNT** — radar chart of 7 indices vs national average; "Oxşar, amma ucuz" 3 cards.
- **AI Analitik section (full width under map+panel, visually distinct card):**
  headline, tag chips with reasons, summary paragraph, two columns Güclü / Zəif tərəflər (each bullet ends with the metric it's based on), "Kimə uyğundur", "Diqqət et", confidence note, small text "AI bu təhlili yalnız yuxarıdakı göstəricilərə əsasən yazıb".
  If persona is set: extra block "Sənin üçün" — fit score 0–100, why, trade-offs.
  Input "Bu ərazi haqqında soruş" → grounded Q&A.
- **Tools drawer / sections:** Həqiqi qiymət (F6), Hüquqi yoxlama (F7), Biznes boşluğu (F9).
- **`/muqayise`:** pick 2–3 regions → grouped bars per tab + AI comparison paragraph.
- **`/menbeler`:** table of `sources.json` + methodology (indices formula, coverage rules, what is mock) + limitations.

---

## 7. Scoring (`src/lib/score.ts`, pure functions)
- For each metric, percentile rank within the same level (rayon vs baku_district) → 0–100.
- Indices = mean of their metric percentiles:
  - rahatliq: grocery, pharmacy, food, mall, bank_atm per10k
  - neqliyyat: bus_stops per10k, bus_routes, metro (Baku), inverse nearest_metro_km
  - tehsil: school, kindergarten, university per10k
  - sehiyye: hospital, clinic, pharmacy per10k
  - tebiet: forest+water+park share, inverse pm25, coastal bonus +10 (cap 100)
  - infrastruktur: paved_pct, inverse unpaved_pct
  - elcatanliq: inverse of the main price for the persona's property type (fallback menzil_kohne)
- Missing input → index computed from remaining metrics; if none → null and UI shows "—".
- Fit score = Σ(weight_i × index_i) / Σ weight_i, then hard filters (budget: price × desired m² > budget → score × 0.3 and label "büdcədən baha").
- Similar regions: cosine similarity on the 6 non-price indices; keep those with lower main price; top 3.
- True cost (10 il) = price × m² + 120 × (monthly_transport_AZN + commute_hours_month × hourly_value). Commute hours: straight-line distance to chosen work hub × 1.4 detour ÷ mode speed (metro 30 km/h, bus 15, car 25 in Baku; car 60 between cities). Label as "təxmini model".
- Business gap: for each POI category, residents per facility vs national median; gap = ratio > 1.5 and population > 10k → list top 3 with "1 aptekə X sakin düşür (ölkə ortası Y)".

---

## 8. AI (server route handlers in `src/app/api/*`)
All prompts in `src/lib/prompts.ts`. All outputs zod-validated; on invalid JSON retry once with the validation error, then return a graceful fallback. Cache by sha256(input) in `data/ai-cache/` (dev) and in-memory (prod).

1. **Precomputed profiles** — `scripts/ai-profiles.mjs` (AI_BATCH_MODEL): for every region send its Region JSON (without geometry) + national medians → `AIProfile`. Run once, write into `regions-*.json`. Concurrency 5. This makes the demo instant and reliable.
2. **`/api/persona`** — free text → `{ property_type, budget_azn, desired_m2, work_hub: [lon,lat] | null, mode: "metro"|"bus"|"car"|"walk", weights: Record<IndexKey, 0..1>, hard_requirements: string[], summary_az }`. Few-shot with 3 examples (family with kids, student, retiree wanting nature). Work hub: AI picks from a fixed list of ~15 hubs (Baku districts' centres + major cities) — never invents coordinates.
3. **`/api/fit-explain`** — persona + top region JSON → "Sənin üçün" block (fit reasoning, trade-offs).
4. **`/api/ask`** — question + one region JSON → answer grounded only in the JSON; if not answerable say so.
5. **`/api/compare`** — 2–3 region JSONs → comparison paragraph + "kimə hansı".
6. **`/api/legal-check`** — listing text + `data/legal/*` → `{ red_flags: [{phrase, meaning, risk:"yüksək"|"orta"|"aşağı"}], checklist: [{step, where, document}], verdict }`. Detect typical phrases: "çıxarışsız", "kupçasız", "müqavilə ilə", "etibarnamə ilə", "kupça hazırlanır", "ipotekaya yararsız", "yarımçıq tikili", "qeydiyyatsız". Disclaimer: "Bu hüquqi məsləhət deyil."

System prompt rules for all: Azerbaijani output, concise, cite metric names, never invent numbers, mention low coverage/mock data, no promises about future prices.

---

## 9. Phases (time-boxed; total ≈ 6 h)
Run **two Claude Code sessions in parallel** after Phase 0: Session A = data (P1–P2), Session B = UI (P3–P4) using `public/data/*.mock.json` generated from the types. They meet at the contract in §5.

| Phase | Box | Deliverable |
|---|---|---|
| P0 Setup | 15 m | Next.js app, deps, folder structure, `types.ts`, mock data generator (`scripts/mock-data.mjs` → realistic fake regions flagged `mock`), `npm run check`. |
| P1 Data fetch | 90 m | Geofabrik + osmium (or Overpass fallback), boundaries, POIs, transport, roads, landcover; Open-Meteo elevation/climate/air; DSK attempt; manual CSV templates (prices, population if DSK fails, aliases). |
| P2 Build & score | 40 m | `build-data.mjs`, `score.ts`, national medians, sources.json, size check. |
| P3 Map | 75 m | MapLibre choropleth, level switch, metric chips, legend, tooltip, select/zoom, smooth transitions. |
| P4 Panel & charts | 60 m | KPI tiles, all tabs with Recharts, badges, coverage warning, DNT radar, similar regions. |
| P5 AI | 60 m | Profiles batch, persona → recolour + TOP-5, AI Analitik section, ask box. |
| P6 Tools | 40 m | True cost, legal check, compare page, (business gap if time). |
| P7 Ship | 30 m | `/menbeler`, README (§10), Vercel deploy, demo run-through, fix only demo-path bugs. |
Cut order if late: F9 → F8 → F6 → F5. Never cut F10 or README.

---

## 10. README (written for AI judges — clear structure, no hype)
1. Problem (3 questions) — with 1–2 sourced facts (e.g. Baku price-to-income from Central Bank / ABB reports) and short quotes from real user interviews done at the hackathon (human provides).
2. Solution — one paragraph + 3 screenshots (map, panel charts, AI section).
3. What the AI actually does — 6 bullet points (profiles, persona→weights, fit explanation, grounded Q&A, comparison, legal check) and why each needs an LLM.
4. Data & transparency — table: dataset, source, live/official/sample/mock, coverage. Explicit limitations.
5. Methodology — index formulas, fit score, true cost model.
6. Architecture — diagram (Mermaid) data pipeline → static JSON → Next.js → AI routes.
7. Business model — B2C free; B2B: realtors & developers (lead gen, area reports), banks (mortgage pre-qualification by area), premium legal check with partner lawyers; municipal planners (service-gap reports).
8. Roadmap — real price data partnerships, Google Places enrichment, Waze for Cities traffic, all-country price coverage, mobile app.
9. Live demo link, how to run locally, team.
