"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Level, National, Region } from "@/lib/types";
import { METRICS, type MetricKey, classify, fmt, quantileBreaks, rampFor, NODATA } from "@/lib/metrics";
import { computeIndices, fitScore, type Persona } from "@/lib/score";
import type { Candidate, Hex, HexData } from "@/lib/decide";
import type { Highlight } from "./MapView";
import { Badge } from "./Badge";
import RegionPanel from "./RegionPanel";
import AIAnalyst from "./AIAnalyst";
import Tools from "./Tools";
import TopNav from "./TopNav";
import Advisor, { type DecideResult } from "./Advisor";
import HexCard from "./HexCard";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

export type FitInfo = { fit: Record<string, number | null>; over: Record<string, boolean> };

/** Hex-level value for the active metric; null = hex has no own value (falls back to transparent). */
function hexValue(h: Hex, metric: MetricKey, cats: string[], parent: Region | undefined, fit?: Record<string, number | null>) {
  const n = (c: string) => h.p[cats.indexOf(c)] ?? 0;
  switch (metric) {
    case "services": return ["pharmacy", "grocery", "school", "kindergarten", "clinic", "hospital", "bank_atm", "food"].reduce((s, c) => s + n(c), 0);
    case "transport": return Math.round(100 * (0.6 * Math.max(0, 1 - (h.m ?? 5000) / 2000) + 0.4 * Math.max(0, 1 - h.s / 800)));
    case "paved": return h.pv;
    case "nature": return h.pk != null ? Math.round(100 * Math.max(0, 1 - h.pk / 1200)) : null;
    case "price": return parent?.prices.menzil_kohne?.value ?? null;
    case "density": return parent?.density.v ?? null;
    case "air": return parent?.air.pm25 ?? null;
    case "fit": return null; // fit is a region-level score; keep hexes clear so the recommendation pins stand out
  }
}

export default function Explorer() {
  const [data, setData] = useState<{ az: Region[]; baku: Region[]; national: Record<Level, National> } | null>(null);
  const [hexes, setHexes] = useState<HexData | null>(null);
  const [level, setLevel] = useState<Level>("baku_district");
  const [metric, setMetric] = useState<MetricKey>("price");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [tab, setTab] = useState<"advisor" | "area">("advisor");
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [initialQuery, setInitialQuery] = useState<string | null>(null);

  useEffect(() => {
    setInitialQuery(new URLSearchParams(window.location.search).get("q"));
    Promise.all([
      fetch("/data/regions-az.json").then((r) => r.json()),
      fetch("/data/regions-baku.json").then((r) => r.json()),
      fetch("/data/national.json").then((r) => r.json()),
      fetch("/data/mahalle.json").then((r) => r.json()),
    ]).then(([az, baku, national, hx]) => {
      setData({ az, baku, national });
      setHexes(hx);
      setSelectedId("bk-nerimanov");
    });
  }, []);

  const all = useMemo(() => (data ? [...data.az, ...data.baku] : []), [data]);
  const byId = useMemo(() => new Map(all.map((r) => [r.id, r])), [all]);
  const levelRegions = useMemo(() => (data ? (level === "rayon" ? data.az : data.baku) : []), [data, level]);

  // persona-specific indices (affordability depends on property type)
  const personaRegions = useMemo(() => {
    if (!data || !persona) return null;
    const out: Region[] = [];
    for (const rs of [data.az, data.baku]) {
      const idx = computeIndices(rs, persona.property_type);
      for (const r of rs) out.push({ ...r, indices: idx[r.id] });
    }
    return out;
  }, [data, persona]);

  const fitInfo: FitInfo | null = useMemo(() => {
    if (!persona || !personaRegions) return null;
    const fit: Record<string, number | null> = {}, over: Record<string, boolean> = {};
    const hub = persona.work_hub_id ? personaRegions.find((r) => r.id === persona.work_hub_id)?.centroid ?? null : null;
    for (const r of personaRegions) {
      const f = fitScore(r, persona, hub);
      fit[r.id] = f.fit;
      over[r.id] = f.overBudget;
    }
    return { fit, over };
  }, [persona, personaRegions]);

  const m = METRICS.find((x) => x.key === metric)!;
  const ctx = useMemo(() => ({ fit: fitInfo?.fit, priceType: persona?.property_type === "menzil_yeni" ? ("menzil_yeni" as const) : ("menzil_kohne" as const) }), [fitInfo, persona]);
  const values = useMemo(() => levelRegions.map((r) => m.get(r, ctx)), [levelRegions, m, ctx]);
  const breaks = useMemo(() => quantileBreaks(values), [values]);
  const colors = useMemo(() => Object.fromEntries(levelRegions.map((r, i) => [r.id, classify(values[i], breaks, m.ramp)])), [levelRegions, values, breaks, m]);
  const hexColors = useMemo(() => {
    if (!hexes) return {};
    const vals = hexes.hexes.map((h) => hexValue(h, metric, hexes.cats, byId.get(h.r), fitInfo?.fit));
    const b = quantileBreaks(vals);
    return Object.fromEntries(hexes.hexes.map((h, i) => [h.h, vals[i] == null ? "rgba(0,0,0,0)" : classify(vals[i], b, m.ramp)]));
  }, [hexes, metric, byId, fitInfo, m]);

  const selected = all.find((r) => r.id === selectedId) ?? null;
  const selectedForPanel = selected && personaRegions ? personaRegions.find((r) => r.id === selected.id) ?? selected : selected;
  const hexById = useMemo(() => new Map((hexes?.hexes ?? []).map((h) => [h.h, h])), [hexes]);
  const hoverRegion = hover && !hover.id.startsWith("hex:") ? all.find((r) => r.id === hover.id) : null;
  const hoverHex = hover?.id.startsWith("hex:") ? hexById.get(hover.id.slice(4)) : null;
  const selHex = selectedHex ? hexById.get(selectedHex) ?? null : null;

  function onDecide(res: DecideResult) {
    const it = res.intent;
    setPersona({
      property_type: it.property_type,
      budget_azn: it.budget_azn,
      desired_m2: it.desired_m2,
      work_hub_id: null,
      mode: it.hard_constraints.metro_within_m ? "metro" : "bus",
      weights: it.soft_preferences,
      hard_requirements: [],
      summary_az: res.question,
    });
    setMetric("fit");
    const c = res.candidates;
    if (c.length) {
      const toBaku = c[0].kind === "hex" ? c[0].region_id.startsWith("bk-") : false;
      setLevel(toBaku ? "baku_district" : "rayon");
      setSelectedId(c[0].region_id);
      setSelectedHex(c[0].kind === "hex" ? c[0].area_id : null);
    }
    setHighlights(c.map((x) => ({ rank: x.rank, centroid: x.centroid, area_id: x.area_id, kind: x.kind, region_id: x.region_id })));
  }
  function onPick(c: Candidate) {
    setSelectedId(c.region_id);
    setSelectedHex(c.kind === "hex" ? c.area_id : null);
    setTab("area");
  }
  function selectRegion(id: string) {
    setSelectedId(id);
    setSelectedHex(null);
    setTab("area");
  }
  function selectHex(h: string) {
    const x = hexById.get(h);
    if (!x) return;
    setSelectedHex(h);
    setSelectedId(x.r);
    setTab("area");
  }
  function switchLevel(l: Level) {
    setLevel(l);
    setHighlights([]);
    if (l === "rayon" && metric === "price") setMetric("services"); // prices exist only for 7 cities at country level
    setSelectedId(l === "rayon" ? "az-baki" : "bk-nerimanov");
    setSelectedHex(null);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-sand-3 bg-sand/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-[22px] font-extrabold tracking-[-0.04em] text-caspian">Məskən</span>
            <span className="hidden text-xs text-ink-3 lg:inline">harada yaşamalı — rəqəmlərlə</span>
          </Link>
          {persona && (
            <span className="max-w-[46ch] truncate rounded-full bg-green/10 px-3 py-1 text-xs font-semibold text-green" title={persona.summary_az}>
              Xəritə rənglənib: “{persona.summary_az}”
              <button className="ml-2 text-ink-3 hover:text-ink" aria-label="Uyğunluq rəngini sil" onClick={() => { setPersona(null); setMetric("price"); setHighlights([]); }}>×</button>
            </span>
          )}
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-sand-3 bg-sand-2 p-0.5 text-sm font-semibold" role="tablist" aria-label="Səviyyə">
            {(["rayon", "baku_district"] as Level[]).map((l) => (
              <button key={l} role="tab" aria-selected={level === l} onClick={() => switchLevel(l)} className={`rounded-md px-3 py-1.5 ${level === l ? "bg-caspian text-sand-2" : "text-ink-2 hover:text-ink"}`}>
                {l === "rayon" ? "Azərbaycan" : "Bakı"}
              </button>
            ))}
          </div>
          <TopNav hideMap />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(400px,1fr)]">
        <section className="relative flex min-h-[460px] flex-col overflow-hidden rounded-2xl border border-sand-3 bg-[var(--map-bg)] lg:h-[calc(100vh-96px)] lg:min-h-[560px]">
          <div className="relative z-10 flex gap-1.5 overflow-x-auto p-3 md:flex-wrap" role="tablist" aria-label="Göstərici">
            {METRICS.filter((x) => x.key !== "fit" || persona).map((x) => (
              <button key={x.key} role="tab" aria-selected={metric === x.key} onClick={() => setMetric(x.key)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold shadow-sm transition-colors ${metric === x.key ? "bg-ink text-sand" : "bg-sand-2/90 text-ink-2 hover:text-ink"}`}>
                {x.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            {data && <MapView level={level} regions={all} colors={colors} hexColors={hexColors} selectedId={selectedId} highlights={highlights} onSelect={selectRegion} onSelectHex={selectHex} onHover={(id, x, y) => setHover(id ? { id, x, y } : null)} />}
            {!data && <div className="absolute inset-0 grid place-items-center text-sm text-ink-3">Xəritə yüklənir…</div>}
            {hover && (hoverRegion || hoverHex) && (
              <div className="tip-in pointer-events-none absolute z-20 max-w-[280px] rounded-lg border border-sand-3 bg-sand-2 px-3 py-2 shadow-lg" style={{ left: hover.x + 14, top: hover.y + 14 }}>
                {hoverRegion && (
                  <>
                    <div className="text-sm font-extrabold">{hoverRegion.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-2">
                      <span className="num font-bold text-ink">{fmt(m.get(hoverRegion, ctx), m.digits ?? 0)}</span> {m.unit}
                      <Badge kind={m.badge(hoverRegion, ctx)} />
                    </div>
                  </>
                )}
                {hoverHex && hexes && (
                  <>
                    <div className="text-sm font-extrabold">{hoverHex.l}</div>
                    <div className="mt-0.5 text-xs text-ink-2">
                      metro {hoverHex.m != null ? `${fmt(hoverHex.m)} m` : "—"} · dayanacaq {fmt(hoverHex.s)} m · {hoverHex.p.reduce((a, b) => a + b, 0)} obyekt
                    </div>
                    <div className="mt-0.5 text-[10px] text-ink-3">məhəllə · təxmini sərhəd · <Badge kind="osm" /></div>
                  </>
                )}
              </div>
            )}
            <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-sand-3 bg-sand-2/95 px-3 py-2 shadow-sm">
              <div className="mb-1 flex items-center gap-2 text-xs font-bold">
                {m.label} <span className="font-medium text-ink-3">{m.unit}</span>
              </div>
              <div className="flex items-end gap-0.5">
                {rampFor(breaks, m.ramp).map((c, i) => (
                  <div key={c + i} className="flex flex-col items-start">
                    <div className="h-2.5 w-11" style={{ background: c }} />
                    <span className="num mt-0.5 text-[10px] text-ink-3">{i === 0 ? "" : fmt(breaks[i - 1], m.digits ?? 0)}</span>
                  </div>
                ))}
                <div className="ml-2 flex flex-col items-start">
                  <div className="h-2.5 w-6" style={{ background: NODATA }} />
                  <span className="mt-0.5 text-[10px] text-ink-3">yoxdur</span>
                </div>
              </div>
              {m.note && <div className="mt-1 max-w-[300px] text-[10px] leading-snug text-ink-3">{m.note}</div>}
              {level === "baku_district" && <div className="mt-1 max-w-[300px] text-[10px] leading-snug text-ink-3">Yaxınlaşdır: məhəllələr görünəcək.</div>}
            </div>
          </div>
        </section>

        <aside className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-sand-3 bg-sand-2 lg:h-[calc(100vh-96px)] lg:min-h-[560px]">
          <div className="flex shrink-0 border-b border-sand-3" role="tablist">
            <button role="tab" aria-selected={tab === "advisor"} onClick={() => setTab("advisor")} className={`flex-1 border-b-2 px-3 py-2.5 text-sm font-bold ${tab === "advisor" ? "border-caspian text-caspian" : "border-transparent text-ink-3"}`}>AI məsləhətçi</button>
            <button role="tab" aria-selected={tab === "area"} onClick={() => setTab("area")} className={`flex-1 truncate border-b-2 px-3 py-2.5 text-sm font-bold ${tab === "area" ? "border-caspian text-caspian" : "border-transparent text-ink-3"}`}>Ərazi{selected ? `: ${selected.name}` : ""}</button>
          </div>
          <div className={`min-h-0 flex-1 ${tab === "advisor" ? "flex flex-col" : "hidden"}`}>
            <Advisor onResult={onDecide} onPick={onPick} initialQuery={initialQuery} />
          </div>
          <div className={`min-h-0 flex-1 overflow-y-auto ${tab === "area" ? "" : "hidden"}`}>
            {selHex && hexes && selected && <HexCard hex={selHex} cats={hexes.cats} parent={selected} />}
            {selectedForPanel && data ? (
              <RegionPanel region={selectedForPanel} national={data.national[selectedForPanel.level]} peers={selectedForPanel.level === "rayon" ? data.az : data.baku} onSelect={selectRegion} fit={fitInfo?.fit[selectedForPanel.id] ?? null} overBudget={!!fitInfo?.over[selectedForPanel.id]} />
            ) : (
              <div className="grid h-full place-items-center p-8 text-sm text-ink-3">Xəritədə bir ərazi seç</div>
            )}
          </div>
        </aside>

        {selectedForPanel && data && (
          <div className="lg:col-span-2">
            <AIAnalyst region={selectedForPanel} national={data.national[selectedForPanel.level]} persona={persona} fit={fitInfo?.fit[selectedForPanel.id] ?? null} overBudget={!!fitInfo?.over[selectedForPanel.id]} />
          </div>
        )}
        {selectedForPanel && data && (
          <div className="lg:col-span-2">
            <Tools region={selectedForPanel} all={all} persona={persona} />
          </div>
        )}
      </main>
      <footer className="mx-auto w-full max-w-[1600px] px-4 pb-8 pt-2 text-xs text-ink-3">
        Məlumat: OpenStreetMap (ODbL), Dövlət Statistika Komitəsi, Open-Meteo. Qiymətlərin çoxu demo dəyərdir — <Link href="/menbeler" className="underline">mənbələrə bax</Link>. Məskən hüquqi və ya maliyyə məsləhəti vermir.
      </footer>
    </div>
  );
}
