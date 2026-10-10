// i18n check (part of `npm run check`): both message files must have the same keys, no English value may be empty
// (Azerbaijani may be empty only where the English note has no Azerbaijani counterpart), and English values may contain
// Azerbaijani letters only inside official place names or quoted Azerbaijani phrases (“…”) that carry an English gloss.
import fs from "node:fs";

const az = JSON.parse(fs.readFileSync("messages/az.json", "utf8"));
const en = JSON.parse(fs.readFileSync("messages/en.json", "utf8"));
const flat = (o, p = "", out = {}) => {
  for (const [k, v] of Object.entries(o)) typeof v === "object" ? flat(v, `${p}${k}.`, out) : (out[`${p}${k}`] = v);
  return out;
};
const A = flat(az), E = flat(en);
const errors = [];
for (const k of Object.keys(A)) if (!(k in E)) errors.push(`missing in en: ${k}`);
for (const k of Object.keys(E)) if (!(k in A)) errors.push(`missing in az: ${k}`);
for (const [k, v] of Object.entries(E)) if (k in A && !String(v).trim() && String(A[k]).trim()) errors.push(`empty en value: ${k}`);

// Allowlist: official names from the data (districts, Baku districts, metro, neighbourhood labels) + brand + glossary terms.
const names = new Set(["Məskən", "Azəriqaz", "Azərişıq", "Azərsu", "MİDA", "məhəllə", "rayon", "çıxarış", "kupça", "Əcəmi-2"]);
const add = (s) => s && s.split(/[\s·,()]+/).forEach((w) => w && names.add(w));
for (const f of ["public/data/regions-az.json", "public/data/regions-baku.json"]) for (const r of JSON.parse(fs.readFileSync(f, "utf8"))) add(r.name);
for (const h of JSON.parse(fs.readFileSync("public/data/mahalle.json", "utf8")).hexes ?? []) add(h.l);
const AZ = /[əğışçöüƏĞİŞÇÖÜ]/;
for (const [k, v] of Object.entries(E)) {
  const rest = String(v)
    .replace(/“[^”]*”/g, "") // quoted Azerbaijani phrase (glossed in the same sentence)
    .split(/[\s·,.;:()/<>{}!?—–-]+/)
    .filter((w) => AZ.test(w) && !names.has(w) && !names.has(w.replace(/['’]s$/, "")));
  if (rest.length) errors.push(`Azerbaijani text in en ${k}: ${rest.join(" ")}`);
}
// English copies of data-driven text shown on /en pages
const src = JSON.parse(fs.readFileSync("public/data/sources.json", "utf8"));
for (const d of src.datasets) if (!d.en) errors.push(`sources.json dataset without en: ${d.key}`);
const ev = JSON.parse(fs.readFileSync("public/data/evals.json", "utf8"));
for (const c of ev.sanity?.checks ?? []) if (!c.name_en) errors.push(`sanity check without English name: ${c.name}`);
for (const f of ev.failures ?? []) if (!f.en) errors.push(`failure case without en: ${f.title}`);
console.log(`i18n-check: ${Object.keys(A).length} az / ${Object.keys(E).length} en keys, ${errors.length} problems`);
if (errors.length) {
  for (const e of errors.slice(0, 40)) console.log("  ✗", e);
  process.exit(1);
}
