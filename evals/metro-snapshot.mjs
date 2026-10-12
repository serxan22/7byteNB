// Deterministic snapshot of the Nərimanov metro query (fixed intent, no AI) → evals/results/metro-snapshot-<tag>.json.
// Used to report before/after when the metro source changes. Usage: node evals/metro-snapshot.mjs before|after
import fs from "node:fs";
import { confidence, keywordIntent, locationCatalog, retrieve } from "../src/lib/decide.ts";

const tag = process.argv[2] ?? "now";
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const regions = [...read("public/data/regions-az.json"), ...read("public/data/regions-baku.json")];
const hx = read("public/data/mahalle.json");
const catalog = locationCatalog(regions, hx);
const intent = keywordIntent("Nərimanovda metroya yaxın ev lazımdır", catalog);
intent.locations_mentioned = ["bk-nerimanov"];
const r = retrieve(intent, regions, hx, catalog, read("public/data/settlements.json"));
const conf = confidence(intent, r);
const out = {
  tag,
  metro_stations_baku: regions.find((x) => x.id === "az-baki").transport.metro,
  candidates: r.candidates.map((c) => ({ label: c.label, metro_walk_m: c.metrics.metro_walk_m, nearest_metro: c.metrics.nearest_metro, score: c.score })),
  confidence: conf.score,
};
fs.mkdirSync("evals/results", { recursive: true });
fs.writeFileSync(`evals/results/metro-snapshot-${tag}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
