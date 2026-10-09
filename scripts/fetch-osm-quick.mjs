// MƏSKƏN — bütün Azərbaycan üzrə OSM məlumatlarını çəkən skript
// Quraşdırma:  npm i osmtogeojson @turf/boolean-point-in-polygon @turf/bbox @turf/helpers
// İşə salma:   node fetch-data.mjs
// Nəticə (data/ qovluğu):
//   pois.json                  — bütün POI-lər (kateqoriya, ad, koordinat)
//   boundaries_lvlN.geojson    — inzibati sərhədlər (hər səviyyə ayrıca)
//   stats_lvlN.json            — hər ərazidə kateqoriya üzrə say
// Qeyd: ölkə miqyasında sorğular 5–15 dəqiqə çəkə bilər. Serverlər məşğul olsa, skript özü gözləyib təkrarlayır.

import fs from "node:fs/promises";
import osmtogeojson from "osmtogeojson";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import bbox from "@turf/bbox";
import { point } from "@turf/helpers";

// Əsas server məşğul olsa, ikinciyə keçir
const SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Azərbaycanın sərhədi (Naxçıvan daxil), qonşu ölkələr kənarda qalır
const AREA = `area["ISO3166-1"="AZ"]["admin_level"="2"]->.az;`;

const CATEGORIES = {
  school:       `nwr["amenity"="school"]`,
  kindergarten: `nwr["amenity"="kindergarten"]`,
  pharmacy:     `nwr["amenity"="pharmacy"]`,
  health:       `nwr["amenity"~"^(hospital|clinic|doctors)$"]`,
  grocery:      `nwr["shop"~"^(supermarket|convenience|greengrocer)$"]`,
  bus_stop:     `nwr["highway"="bus_stop"]`,
  metro:        `nwr["station"="subway"]`,
  rail:         `nwr["railway"="station"]["station"!="subway"]`,
  park:         `nwr["leisure"="park"]`,
  food_night:   `nwr["amenity"~"^(cafe|restaurant|bar|pub)$"]`,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const url = SERVERS[(attempt - 1) % SERVERS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      if (res.ok) return await res.json();
      console.log(`  ${url} → ${res.status}, yenidən cəhd (${attempt}/6)...`);
    } catch (e) {
      console.log(`  ${url} → şəbəkə xətası, yenidən cəhd (${attempt}/6)...`);
    }
    await sleep(attempt * 10000);
  }
  throw new Error("Overpass cavab vermir — bir neçə dəqiqə sonra yenidən işə salın");
}

async function fetchPois() {
  const pois = [];
  for (const [cat, selector] of Object.entries(CATEGORIES)) {
    console.log(`POI: ${cat}`);
    const q = `[out:json][timeout:300];${AREA}${selector}(area.az);out center tags;`;
    const data = await overpass(q);
    for (const el of data.elements) {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null) continue;
      pois.push({
        id: `${el.type}/${el.id}`,
        cat,
        name: el.tags?.["name:az"] || el.tags?.name || null,
        lat,
        lon,
      });
    }
    console.log(`  ${data.elements.length} obyekt`);
    await sleep(3000);
  }
  return pois;
}

async function fetchBoundaries() {
  // 4–7: rayonlar, şəhərlər, Bakının rayonları və qəsəbələri adətən bu aralıqdadır
  console.log("Sərhədlər (admin_level 4–7)...");
  const q = `[out:json][timeout:600];${AREA}
    relation["boundary"="administrative"]["admin_level"~"^(4|5|6|7)$"](area.az);
    out geom;`;
  const data = await overpass(q);
  const gj = osmtogeojson(data);
  const byLevel = {};
  for (const f of gj.features) {
    if (!["Polygon", "MultiPolygon"].includes(f.geometry?.type)) continue;
    const lvl = f.properties?.admin_level;
    if (!lvl) continue;
    f.properties = {
      id: f.properties.id,
      name: f.properties["name:az"] || f.properties.name,
      name_en: f.properties["name:en"] || null,
      admin_level: lvl,
    };
    (byLevel[lvl] ||= []).push(f);
  }
  return byLevel;
}

function computeStats(features, pois) {
  return features.map((f) => {
    const [minX, minY, maxX, maxY] = bbox(f);
    const counts = Object.fromEntries(Object.keys(CATEGORIES).map((c) => [c, 0]));
    for (const p of pois) {
      // sürətli bbox yoxlaması, sonra dəqiq yoxlama
      if (p.lon < minX || p.lon > maxX || p.lat < minY || p.lat > maxY) continue;
      if (booleanPointInPolygon(point([p.lon, p.lat]), f)) counts[p.cat]++;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      id: f.properties.id,
      name: f.properties.name,
      name_en: f.properties.name_en,
      counts,
      // OSM regionlarda natamam ola bilər: az obyekt "yoxdur" yox, "xəritələnməyib" deməkdir
      osm_coverage: total > 200 ? "yüksək" : total > 40 ? "orta" : "aşağı",
      source: "OpenStreetMap",
    };
  });
}

await fs.mkdir("data", { recursive: true });

const pois = await fetchPois();
await fs.writeFile("data/pois.json", JSON.stringify(pois));
console.log(`\npois.json: ${pois.length} POI`);

const byLevel = await fetchBoundaries();
for (const [lvl, feats] of Object.entries(byLevel).sort()) {
  await fs.writeFile(
    `data/boundaries_lvl${lvl}.geojson`,
    JSON.stringify({ type: "FeatureCollection", features: feats })
  );
  const stats = computeStats(feats, pois);
  await fs.writeFile(`data/stats_lvl${lvl}.json`, JSON.stringify(stats, null, 2));
  console.log(
    `admin_level ${lvl}: ${feats.length} ərazi — məs. ${feats.slice(0, 6).map((f) => f.properties.name).join(", ")}`
  );
}

console.log(
  "\nHazırdır. Ölkə xəritəsi üçün rayonların olduğu səviyyəni (~60–80 ərazi), Bakı detalı üçün isə Bakı rayonlarının olduğu səviyyəni götürün."
);
