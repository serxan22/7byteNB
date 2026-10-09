"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Level, National, Region } from "@/lib/types";
import { METRICS, type MetricKey, classify, fmt, quantileBreaks, rampFor, NODATA } from "@/lib/metrics";
import { computeIndices, fitScore, type Persona } from "@/lib/score";
import { Badge } from "./Badge";
import RegionPanel from "./RegionPanel";
import AIAnalyst from "./AIAnalyst";
import Tools from "./Tools";
import ThemeToggle from "./ThemeToggle";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

const EXAMPLES = [
  "2 uşaqlı ailəyik, büdcəmiz 150 min manat, işim Nəsimidədir, metroya yaxın olsun",
  "Tələbəyəm, ucuz kirayə və universitetə yaxın yer axtarıram",
  "Təqaüdçüyəm, sakit, təmiz havası olan, xəstəxanaya yaxın həyət evi istəyirəm",
];

export type FitInfo = { fit: Record<string, number | null>; over: Record<string, boolean> };

export default function Explorer() {
  const [data, setData] = useState<{ az: Region[]; baku: Region[]; national: Record<Level, National> } | null>(null);
  const [level, setLevel] = useState<Level>("baku_district");
  const [metric, setMetric] = useState<MetricKey>("price");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [personaText, setPersonaText] = useState("");
  const [persona, setPersona] = useState<Persona | null>(null);
  const [personaBusy, setPersonaBusy] = useState(false);
  const [personaErr, setPersonaErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/data/regions-az.json").then((r) => r.json()),
      fetch("/data/regions-baku.json").then((r) => r.json()),
      fetch("/data/national.json").then((r) => r.json()),
    ]).then(([az, baku, national]) => {
      setData({ az, baku, national });
      setSelectedId("bk-nerimanov");
    });
  }, []);

  const all = useMemo(() => (data ? [...data.az, ...data.baku] : []), [data]);
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

  const selected = all.find((r) => r.id === selectedId) ?? null;
  const selectedForPanel = selected && personaRegions ? personaRegions.find((r) => r.id === selected.id) ?? selected : selected;
  const hoverRegion = hover ? all.find((r) => r.id === hover.id) : null;

  const top5 = useMemo(() => {
    if (!fitInfo) return [];
    return levelRegions
      .map((r) => ({ r, f: fitInfo.fit[r.id] }))
      .filter((x) => x.f != null)
      .sort((a, b) => (b.f ?? 0) - (a.f ?? 0))
      .slice(0, 5);
  }, [fitInfo, levelRegions]);

  // after a persona is applied, focus the best match so "Sənin üçün" is visible
  useEffect(() => {
    if (top5[0]) setSelectedId(top5[0].r.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitInfo]);

  async function runPersona(text: string) {
    if (!text.trim()) return;
    setPersonaBusy(true);
    setPersonaErr(null);
    try {
      const res = await fetch("/api/persona", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Xəta");
      setPersona(j.persona);
      setMetric("fit");
    } catch (e) {
      setPersonaErr(e instanceof Error ? e.message : "Xəta baş verdi");
    } finally {
      setPersonaBusy(false);
    }
  }

  function switchLevel(l: Level) {
    setLevel(l);
    if (l === "rayon" && metric === "price") setMetric("services"); // prices exist only for 7 cities at country level
    setSelectedId(l === "rayon" ? "az-baki" : "bk-nerimanov");
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-sand-3 bg-sand/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-[22px] font-extrabold tracking-[-0.04em] text-caspian">Məskən</span>
            <span className="hidden text-xs text-ink-3 lg:inline">harada yaşamalı — rəqəmlərlə</span>
          </Link>
          <form
            className="flex min-w-[280px] flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              runPersona(personaText);
            }}
          >
            <input
              value={personaText}
              onChange={(e) => setPersonaText(e.target.value)}
              placeholder="Həyatını bir cümlə ilə təsvir et…"
              aria-label="Həyatını bir cümlə ilə təsvir et"
              className="h-10 w-full rounded-lg border border-sand-3 bg-sand-2 px-3 text-sm outline-none placeholder:text-ink-3 focus:border-caspian"
            />
            <button disabled={personaBusy} className="h-10 shrink-0 rounded-lg bg-caspian px-4 text-sm font-bold text-sand-2 disabled:opacity-60">
              {personaBusy ? "Təhlil edilir…" : "Xəritəni rənglə"}
            </button>
          </form>
          <div className="flex items-center gap-1 rounded-lg border border-sand-3 bg-sand-2 p-0.5 text-sm font-semibold" role="tablist" aria-label="Səviyyə">
            {(["rayon", "baku_district"] as Level[]).map((l) => (
              <button key={l} role="tab" aria-selected={level === l} onClick={() => switchLevel(l)} className={`rounded-md px-3 py-1.5 ${level === l ? "bg-caspian text-sand-2" : "text-ink-2 hover:text-ink"}`}>
                {l === "rayon" ? "Azərbaycan" : "Bakı"}
              </button>
            ))}
          </div>
          <nav className="flex items-center gap-4 text-sm font-semibold text-ink-2">
            <Link href="/muqayise" className="hover:text-caspian">Müqayisə</Link>
            <Link href="/menbeler" className="hover:text-caspian">Mənbələr</Link>
            <ThemeToggle />
          </nav>
        </div>
        <div className="mx-auto flex max-w-[1600px] gap-2 overflow-x-auto px-4 pb-2.5 md:flex-wrap">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setPersonaText(ex);
                runPersona(ex);
              }}
              className="max-w-[80vw] shrink-0 truncate rounded-full border border-sand-3 px-3 py-1 text-xs text-ink-2 hover:border-caspian hover:text-caspian md:max-w-full md:shrink"
            >
              {ex}
            </button>
          ))}
          {personaErr && <span className="text-xs font-semibold text-pomegranate">{personaErr}</span>}
          {persona && (
            <span className="shrink-0 rounded-full bg-green/10 px-3 py-1 text-xs font-semibold text-green">
              {persona.summary_az}
              <button className="ml-2 text-ink-3 hover:text-ink" aria-label="Personanı sil" onClick={() => { setPersona(null); setMetric("price"); }}>×</button>
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(380px,1fr)]">
        {/* Map */}
        <section className="relative flex min-h-[460px] flex-col overflow-hidden rounded-2xl border border-sand-3 bg-[var(--map-bg)] lg:h-[calc(100vh-150px)] lg:min-h-[560px]">
          <div className="relative z-10 flex gap-1.5 overflow-x-auto p-3 md:flex-wrap" role="tablist" aria-label="Göstərici">
            {METRICS.filter((x) => x.key !== "fit" || persona).map((x) => (
              <button
                key={x.key}
                role="tab"
                aria-selected={metric === x.key}
                onClick={() => setMetric(x.key)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold shadow-sm transition-colors ${metric === x.key ? "bg-ink text-sand" : "bg-sand-2/90 text-ink-2 hover:text-ink"}`}
              >
                {x.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            {data && <MapView level={level} regions={all} colors={colors} selectedId={selectedId} onSelect={setSelectedId} onHover={(id, x, y) => setHover(id ? { id, x, y } : null)} />}
            {!data && <div className="absolute inset-0 grid place-items-center text-sm text-ink-3">Xəritə yüklənir…</div>}
            {hover && hoverRegion && (
              <div className="pointer-events-none absolute z-20 rounded-lg border border-sand-3 bg-sand-2 px-3 py-2 shadow-lg" style={{ left: Math.min(hover.x + 14, 9999), top: hover.y + 14 }}>
                <div className="text-sm font-extrabold">{hoverRegion.name}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-2">
                  <span className="num font-bold text-ink">{fmt(m.get(hoverRegion, ctx), m.digits ?? 0)}</span> {m.unit}
                  <Badge kind={m.badge(hoverRegion, ctx)} />
                </div>
                {fitInfo?.over[hoverRegion.id] && metric === "fit" && <div className="mt-0.5 text-[11px] font-semibold text-pomegranate">büdcədən baha</div>}
              </div>
            )}
            {/* Legend */}
            <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-sand-3 bg-sand-2/95 px-3 py-2 shadow-sm">
              <div className="mb-1 flex items-center gap-2 text-xs font-bold">
                {m.label} <span className="font-medium text-ink-3">{m.unit}</span>
              </div>
              <div className="flex items-end gap-0.5">
                {rampFor(breaks, m.ramp).map((c, i) => (
                  <div key={c} className="flex flex-col items-start">
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
            </div>
            {/* TOP-5 */}
            {top5.length > 0 && (
              <div className="absolute right-3 top-0 z-10 w-60 rounded-xl border border-sand-3 bg-sand-2/95 p-3 shadow-sm">
                <div className="text-xs font-bold text-ink-2">Sənə ən uyğun 5 ərazi</div>
                <ol className="mt-1.5 space-y-1">
                  {top5.map(({ r, f }, i) => (
                    <li key={r.id}>
                      <button onClick={() => setSelectedId(r.id)} className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-sm hover:bg-sand-3/60">
                        <span className="num w-4 text-xs text-ink-3">{i + 1}</span>
                        <span className="flex-1 truncate font-semibold">{r.name}</span>
                        <span className="num font-extrabold text-green">{f}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </section>

        {/* Panel */}
        <aside className="min-w-0 rounded-2xl border border-sand-3 bg-sand-2 lg:h-[calc(100vh-150px)] lg:min-h-[560px] lg:overflow-y-auto">
          {selectedForPanel && data ? (
            <RegionPanel region={selectedForPanel} national={data.national[selectedForPanel.level]} peers={selectedForPanel.level === "rayon" ? data.az : data.baku} onSelect={setSelectedId} fit={fitInfo?.fit[selectedForPanel.id] ?? null} overBudget={!!fitInfo?.over[selectedForPanel.id]} />
          ) : (
            <div className="grid h-full place-items-center p-8 text-sm text-ink-3">Xəritədə bir ərazi seç</div>
          )}
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
