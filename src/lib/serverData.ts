import fs from "node:fs";
import path from "node:path";
import type { Level, National, Region } from "./types.ts";

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
