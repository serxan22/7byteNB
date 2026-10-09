# MƏSKƏN — SPEC (condensed)

§1 PRODUCT
A clean, beautiful 2D map of Azerbaijan (no cluttered street basemap): every rayon/city and every Baku district is a coloured region. A buyer of a flat, courtyard house, commercial property or land clicks an area and sees prices by type, services, transport, road quality, nature, density — as CHARTS. Below: an AI Analyst section that categorises the area and explains it in detail. User can describe their life in one sentence → whole map recolours by personal fit.
Pitch: "Ev alan insan 3 şeyi bilmir: hansı ərazi ona uyğundur, evin real qiyməti nədir, alışda hüquqi risk nədir."

§2 FEATURES (build in order, cut from the bottom)
F1 MUST: choropleth map AZ (rayon level) + Baku districts level; metric switcher; hover tooltip; click → side panel.
F2 MUST: region panel with tabs + charts + source badges (§6).
F3 MUST: AI Analitik section per region (precomputed profile).
F4 MUST: persona text → AI weights → map recolours by fit + TOP-5 list.
F10 MUST: /menbeler page (all datasets, URLs, dates, coverage, methodology, limitations).
F5 SHOULD: "Ərazi DNT-si" radar (7 indices vs national) + "Oxşar, amma ucuz" (3 similar regions, cheaper).
F6 SHOULD: True cost 10-year calculator.
F7 SHOULD: Legal check of a pasted listing text.
F8 SHOULD: /muqayise page for 2–3 regions.
F9 NICE: Business gap finder.
Cut order if late: F9→F8→F6→F5. Never cut F10 or README.

§3 DATA
Primary bulk source: OpenStreetMap Geofabrik extract https://download.geofabrik.de/asia/azerbaijan-latest.osm.pbf processed with osmium-tool (tags-filter + export geojsonseq). If osmium unavailable → Overpass API (area["ISO3166-1"="AZ"]["admin_level"="2"]); if scripts/fetch-osm-quick.mjs exists, reuse and extend it.
A. Boundaries: boundary=administrative; find the admin_level giving ~60–80 rayons/cities and the one giving Baku's 12 districts. Simplify (regions-az.geojson <1.5MB, regions-baku.geojson <0.5MB). Name normalisation + data/manual/name-aliases.json for joining DSK/price data.
B. POIs (count + per 10k residents): pharmacy(amenity=pharmacy), grocery(shop=supermarket|convenience|greengrocer), mall(shop=mall), bazaar(amenity=marketplace), food(amenity=restaurant|cafe|fast_food), school, kindergarten, university(amenity=university|college), hospital, clinic(amenity=clinic|doctors), bank_atm, fuel, sport(leisure=sports_centre|fitness_centre|stadium), park. Also public/data/pois-baku.json as compact [lon,lat,catIdx] for a zoomed dot layer.
C. Transport: metro (station=subway), rail (railway=station non-subway), bus stops (highway=bus_stop), bus/marshrut routes (relations type=route, route=bus|minibus|share_taxi) → distinct route count per region + route refs for Baku; nearest metro km for Baku districts.
D. Roads: highway in primary|secondary|tertiary|unclassified|residential|living_street|track; assign by midpoint; km by surface: paved (asphalt, concrete, paved, paving_stones), unpaved (unpaved, dirt, ground, gravel, compacted, sand, grass; track without surface = unpaved), unknown. Output total_km, paved_pct, unpaved_pct, unknown_pct.
E. Nature: land cover % from OSM polygons (forest/wood, farmland/orchard/vineyard, water/wetland, beach/sand, residential, industrial, grass/meadow/scrub) — label "təxmini". Elevation: Open-Meteo https://api.open-meteo.com/v1/elevation (≤100 coords/call), 5×5 grid inside each region → mean/min/max/std; terrain: düzənlik(mean<200 & std<50), dağlıq(mean>1000 or std>250), else dağətəyi. Coastal flag: centroid <5 km from natural=coastline. Climate: Open-Meteo archive API last full year at centroid → July avg max, January avg min, annual precipitation. Air: Open-Meteo air-quality API pm2_5 last 30 days mean, label "model (CAMS)". ≤5 req/s, cache all.
F. Official stats: stat.gov.az (DSK) — population latest year + area per rayon → density; if quick, average wage by region. Time-box 15 min; if blocked → data/manual/population.csv template for human.
G. Prices: data/manual/prices.csv columns region_id,region_name,property_type,value,unit,n_samples,source,source_url,collected_at,confidence. property_type: menzil_yeni, menzil_kohne, heyet_evi, obyekt, torpaq. unit AZN_m2 (torpaq: AZN_sot). confidence: official|sample|estimate|mock. Rows for all Baku districts + Bakı, Gəncə, Sumqayıt, Mingəçevir, Lənkəran, Şəki, Quba × 5 types. Real published values (news/bank reviews) = estimate/official; the rest = mock with source "Demo dəyər" and "Demo" badge. Import replaces values with zero code changes.
H. Legal: data/legal/*.md — articles from e-qanun.az. If empty, AI gives checklist without article numbers.
Google Places API: OPTIONAL only if GOOGLE_MAPS_API_KEY set. Yandex/Waze: do not use; list on /menbeler as "gələcəkdə tərəfdaşlıqla".
OUTPUT via scripts/build-data.mjs: public/data/regions-az.json, regions-baku.json (Region[] without geometry), regions-*.geojson (geometry + id), national.json (national medians), data/processed/sources.json. Total public/data <4MB.

§4 STACK (only these)
Next.js + TS + Tailwind; maplibre-gl (GeoJSON source, no external tiles, dynamic import); recharts; zod; @google/genai (Google Gemini, free tier) with env GEMINI_API_KEY, AI_MODEL (default gemini-3.7-flash — gemini-2.5-flash is closed to new keys; newest flash models listed via the API), AI_FALLBACK_MODELS (tried on 503/404); scripts: osmtogeojson, @turf/* (area, bbox, boolean-point-in-polygon, centroid, simplify, length, distance, helpers), xlsx, csv-parse; osmium-tool. Deploy Vercel. Env: GEMINI_API_KEY, AI_MODEL, GOOGLE_MAPS_API_KEY (optional).

§5 CONTRACT src/lib/types.ts
type Badge = "osm"|"official"|"computed"|"sample"|"mock"|"model"; type Val = {v:number|null; badge:Badge};
type PropertyType = "menzil_yeni"|"menzil_kohne"|"heyet_evi"|"obyekt"|"torpaq";
type Price = {value:number|null; unit:"AZN_m2"|"AZN_sot"; n:number; source:string; source_url?:string; confidence:"official"|"sample"|"estimate"|"mock"};
type IndexKey = "rahatliq"|"neqliyyat"|"tehsil"|"sehiyye"|"tebiet"|"infrastruktur"|"elcatanliq";
interface Region { id; name; level:"rayon"|"baku_district"; parent_id?; centroid; area_km2; population:Val; density:Val; pois; per10k; transport:{metro;rail;bus_stops;bus_routes;nearest_metro_km?;route_refs?}; roads:{total_km;paved_pct;unpaved_pct;unknown_pct}; nature:{elev_mean;elev_min;elev_max;ruggedness;terrain;coastal;landcover}; climate:{july_max_c;jan_min_c;precip_mm}; air:{pm25}; prices; indices; coverage:{osm:"yüksək"|"orta"|"aşağı";prices:"official"|"sample"|"mock"|"none"}; ai?:AIProfile }
type CategoryTag = "aile_dostu"|"genc_pesekar"|"telebe"|"teqaudcu"|"biznes_furseti"|"tebiet_sakitlik"|"budce_dostu"|"premium"|"inkisafda"|"turizm";
interface AIProfile { headline(≤12 words); tags:{tag;reason}[](2–4); summary(3–5 sentences); strengths[3]; weaknesses[3] (each cites a metric); best_for[]; watch_out[]; confidence_note }
OSM coverage: total POIs >200 yüksək, >40 orta, else aşağı.

§6 UI
Visual direction (primary judging factor): flat editorial data-journalism look. Map = regions on a calm background, thin white borders, soft shadows, labels at sensible zoom; no street basemap. Palette: Caspian deep blue (primary), Absheron sand (neutral bg), Caucasus green (good), pomegranate red (risk). 5-step sequential choropleth; diverging only for "vs national". Font with ə support (Manrope/Inter via next/font). Big KPI numbers. Light+dark. Mobile: map top, panel as bottom sheet. Smooth fill transitions when metric/persona changes (demo wow moment).
Main page "/":
- Top bar: logo "Məskən", persona input "Həyatını bir cümlə ilə təsvir et…" + 3 example chips, level switch (Azərbaycan / Bakı), links Müqayisə, Mənbələr.
- Map ~60%: metric chips — Uyğunluq (after persona), Mənzil qiyməti, Əhali sıxlığı, Xidmətlər, Nəqliyyat, Asfalt yollar %, Təbiət, Hava keyfiyyəti. Legend with units. Tooltip: name + value + badge.
- Side panel ~40%: header (name, terrain, coastal, AI tag chips, low-coverage warning); KPI tiles (əhali, sıxlıq/km², orta m² qiyməti, metro/dayanacaq, asfalt %); tabs: Qiymətlər (bars per type, land separately AZN/sot, badge per bar, national median marker) · Xidmətlər (per10k vs national, diverging) · Nəqliyyat · Yollar (stacked bar) · Təbiət (landcover donut, elevation, climate, PM2.5 vs WHO 5) · DNT (radar vs national + "Oxşar, amma ucuz").
- AI Analitik card under map+panel: headline, tag chips with reasons, summary, Güclü/Zəif (bullet ends with metric), Kimə uyğundur, Diqqət et, confidence note, footnote "AI bu təhlili yalnız yuxarıdakı göstəricilərə əsasən yazıb". If persona: "Sənin üçün" block (fit 0–100, why, trade-offs). Input "Bu ərazi haqqında soruş".
- Tools: Həqiqi qiymət, Hüquqi yoxlama, Biznes boşluğu.
/muqayise: 2–3 regions, grouped bars + AI comparison. /menbeler: sources.json table + methodology + limitations.

§7 SCORING src/lib/score.ts (pure)
Percentile rank 0–100 within same level. Indices = mean of metric percentiles: rahatliq(grocery, pharmacy, food, mall, bank_atm per10k); neqliyyat(bus_stops per10k, bus_routes, metro, inverse nearest_metro_km); tehsil(school, kindergarten, university per10k); sehiyye(hospital, clinic, pharmacy per10k); tebiet(forest+water+park share, inverse pm25, coastal +10 cap 100); infrastruktur(paved_pct, inverse unpaved_pct); elcatanliq(inverse main price for persona type, fallback menzil_kohne). Missing inputs → compute from rest; none → null shown "—".
Fit = Σ(w·index)/Σw; budget filter: price×desired_m2 > budget → ×0.3 + label "büdcədən baha".
Similar = cosine similarity of 6 non-price indices, keep cheaper, top 3.
True cost 10y = price×m2 + 120×(monthly transport AZN + commute hours/month × hourly value); commute = straight distance ×1.4 ÷ speed (metro 30, bus 15, car 25 km/h Baku; car 60 intercity). Label "təxmini model".
Business gap: residents per facility vs national median; ratio>1.5 and population>10k → top 3.

§8 AI — Google Gemini (src/app/api/*, prompts in src/lib/prompts.ts; every call through src/lib/ai.ts generateJSON(prompt, zodSchema): responseMimeType application/json + responseJsonSchema, zod-validated, 1 retry with the validation error, cached by sha256, graceful fallback; on 429 → cached or "AI hazırda məşğuldur")
1. scripts/ai-profiles.mjs (concurrency 1, ~4 s delay, 429 backoff, resumable from data/processed/ai-profiles.json; Baku districts + main cities first): Region JSON + national medians → AIProfile merged into regions-*.json by build-data.
2. /api/persona: text → {property_type, budget_azn, desired_m2, work_hub_id (fixed ~15 hubs), mode: metro|bus|car|walk, weights: Record<IndexKey,0..1>, hard_requirements[], summary_az}. 3 few-shot examples.
3. /api/fit-explain: persona + top regions → "Sənin üçün".
4. /api/ask: question + Region JSON → grounded answer.
5. /api/compare: 2–3 Regions → comparison + "kimə hansı".
6. /api/legal-check: listing text + data/legal → {red_flags:[{phrase, meaning, risk}], checklist:[{step, where, document}], verdict}. Detect: çıxarışsız, kupçasız, müqavilə ilə, etibarnamə ilə, kupça hazırlanır, ipotekaya yararsız, yarımçıq tikili, qeydiyyatsız. Disclaimer "Bu hüquqi məsləhət deyil."
All: Azerbaijani, concise, cite metric names, never invent numbers, mention low coverage/mock data, no promises about future prices.

§9 PHASES (≈6h): P0 setup · P1 data · P2 build & score · P3 map · P4 panel & charts · P5 AI · P6 tools · P7 ship (/menbeler, README, Vercel, demo path). UI phases work on mock data.

§10 README (for AI judges; clear, no hype)
1 Problem + sourced facts + placeholder for interview quotes. 2 Solution + 3 screenshots. 3 What the AI does (6 bullets). 4 Data & transparency table + limitations. 5 Methodology. 6 Architecture (Mermaid). 7 Business model (B2C free; B2B realtors/developers, banks, premium legal check, municipalities). 8 Roadmap. 9 Demo link, run locally, team.
