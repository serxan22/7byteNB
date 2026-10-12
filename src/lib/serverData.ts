import fs from "node:fs";
import path from "node:path";
import type { Level, National, Region } from "./types.ts";
import type { GazData, HexData, SettlementData } from "./decide.ts";

let stCache: SettlementData | null = null;
let gazCache: GazData | null = null;
export function loadGazetteer(): GazData {
  gazCache ??= JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/gazetteer.json"), "utf8"));
  return gazCache!;
}
export function loadSettlements(): SettlementData {
  stCache ??= JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/settlements.json"), "utf8"));
  return stCache!;
}

let hexCache: HexData | null = null;
export function loadHexes(): HexData {
  // organic neighbourhoods (mahalle) are the retrieval units; H3 hexes remain only the compute grid behind them
  const f = path.join(process.cwd(), "public/data/mahalle.json");
  hexCache ??= JSON.parse(fs.readFileSync(fs.existsSync(f) ? f : path.join(process.cwd(), "public/data/hexes.json"), "utf8"));
  return hexCache!;
}

let cache: { regions: Region[]; national: Record<Level, National> } | null = null;
export function loadData() {
  if (cache) return cache;
  const p = (f: string) => path.join(process.cwd(), "public/data", f);
  const az: Region[] = JSON.parse(fs.readFileSync(p("regions-az.json"), "utf8"));
  const baku: Region[] = JSON.parse(fs.readFileSync(p("regions-baku.json"), "utf8"));
  const national = JSON.parse(fs.readFileSync(p("national.json"), "utf8"));
  cache = { regions: [...az, ...baku], national };
  return cache;
}

export function loadLegal(): string {
  const dir = path.join(process.cwd(), "data/legal");
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => `### ${f}\n${fs.readFileSync(path.join(dir, f), "utf8")}`)
      .join("\n\n");
  } catch {
    return "";
  }
}
