// Seeds data/manual/prices.csv (run once; refuses to overwrite unless --force).
// Real published values (news / bank reviews) are marked estimate|official with source_url.
// Everything else is a clearly-flagged demo value (confidence=mock, source="Demo dəyər"),
// chosen to be consistent with the real anchors: centre > suburbs, new > old, regions < Baku.
import fs from "node:fs";

const OUT = "data/manual/prices.csv";
if (fs.existsSync(OUT) && !process.argv.includes("--force")) {
  console.log(`${OUT} exists — skip (use --force to overwrite)`);
  process.exit(0);
}

const D = "2026-10-09";
const CALIBER = ["Caliber.az (bütün yaşayış, orta, 2026-09)", "https://caliber.az/en/post/a-metre-at-a-premium-why-are-property-prices-rising-in-baku"];
const JAM = (seg) => [`JAM News / Qiymətləndiricilər Palatası (${seg}, median, 2026-07)`, "https://jam-news.net/salaries-rise-7-while-house-prices-climb-12-4-is-it-worth-buying-home-in-azerbaijan/"];
const JARN = (seg) => [`Cyril Jarnias bloqu (${seg}; ilkin mənbə göstərilməyib; USD aralığının ortası ×1.70)`, "https://www.cyriljarnias.com/immobilier-international/investir-immobilier-azerbaidjan/comparatif-immobilier-bakou-ganja-sumqayit/"];

// [id, name, yeni, kohne, heyet, obyekt, torpaq(AZN/sot)]
const ROWS = [
  ["bk-sebail", "Səbail", 4600, 4132, 3000, 6500, 60000],
  ["bk-nesimi", "Nəsimi", 3700, 3300, 2600, 5200, 50000],
  ["bk-yasamal", "Yasamal", 3250, 2900, 2300, 4300, 42000],
  ["bk-nerimanov", "Nərimanov", 3150, 2800, 2200, 4200, 40000],
  ["bk-xetai", "Xətai", 3000, 2600, 1900, 3900, 35000],
  ["bk-nizami", "Nizami", 2800, 2500, 1900, 3600, 32000],
  ["bk-bineqedi", "Binəqədi", 2250, 2000, 1300, 2800, 20000],
  ["bk-xezer", "Xəzər", 1950, 1700, 1100, 2300, 15000],
  ["bk-sabuncu", "Sabunçu", 1850, 1650, 1000, 2200, 14000],
  ["bk-suraxani", "Suraxanı", 1750, 1550, 950, 2000, 12000],
  ["bk-qaradag", "Qaradağ", 1700, 1500, 850, 1900, 9000],
  ["bk-pirallahi", "Pirallahı", 1650, 1452, 800, 1800, 8000],
  ["az-baki", "Bakı", 2812.5, 2616.7, 1500, 4000, 18000],
  ["az-sumqayit", "Sumqayıt", 1150, 850, 750, 1400, 7000],
  ["az-gence", "Gəncə", 1020, 680, 600, 1100, 4000],
  ["az-mingecevir", "Mingəçevir", 900, 650, 500, 900, 3000],
  ["az-lenkeran", "Lənkəran", 850, 600, 450, 850, 2500],
  ["az-quba", "Quba", 850, 600, 550, 850, 3500],
  ["az-seki", "Şəki", 800, 550, 500, 800, 2800],
];
const TYPES = ["menzil_yeni", "menzil_kohne", "heyet_evi", "obyekt", "torpaq"];

// Real published values: key `${id}|${type}` → [source, url, confidence]
const REAL = {
  "bk-sebail|menzil_kohne": [...CALIBER, "estimate"],
  "bk-pirallahi|menzil_kohne": [...CALIBER, "estimate"],
  "az-baki|menzil_yeni": [...JAM("yeni tikili"), "estimate"],
  "az-baki|menzil_kohne": [...JAM("təkrar bazar"), "estimate"],
  "az-gence|menzil_yeni": [...JARN("yeni kompleks 500–700 USD/m²"), "estimate"],
  "az-gence|menzil_kohne": [...JARN("sovet dövrü 300–500 USD/m²"), "estimate"],
  "az-sumqayit|menzil_kohne": [...JARN("kollektiv bina 350–650 USD/m²"), "estimate"],
};

const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
const lines = ["region_id,region_name,property_type,value,unit,n_samples,source,source_url,collected_at,confidence"];
for (const [id, name, ...vals] of ROWS) {
  TYPES.forEach((t, i) => {
    const unit = t === "torpaq" ? "AZN_sot" : "AZN_m2";
    const real = REAL[`${id}|${t}`];
    const [source, url, conf] = real ?? ["Demo dəyər", "", "mock"];
    lines.push([id, q(name), t, vals[i], unit, 0, q(source), url, D, conf].join(","));
  });
}
fs.mkdirSync("data/manual", { recursive: true });
fs.writeFileSync(OUT, lines.join("\n") + "\n");
console.log(`${OUT}: ${lines.length - 1} rows, real=${Object.keys(REAL).length}, demo=${lines.length - 1 - Object.keys(REAL).length}`);
