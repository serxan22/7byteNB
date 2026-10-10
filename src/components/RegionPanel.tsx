"use client";
import { useState } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Legend, PieChart, Pie, Cell, Tooltip } from "recharts";
import type { National, PropertyType, Region } from "@/lib/types";
import { useLocale, useTranslations } from "next-intl";
import { fmt, fmtAZN, priceBadge } from "@/lib/metrics";
import { localizeSource } from "@/lib/labels";
import { similarCheaper } from "@/lib/score";
import { Badge } from "./Badge";
import CountUp from "./CountUp";

const INDEX_KEYS = ["rahatliq", "neqliyyat", "tehsil", "sehiyye", "tebiet", "infrastruktur", "elcatanliq"] as const;

const TABS = ["prices", "services", "transport", "roads", "nature", "dna"] as const;
type Tab = (typeof TABS)[number];

function Kpi({ label, value, unit, badge, num }: { label: string; value: string; unit?: string; badge: React.ReactNode; num?: number | null }) {
  const tc = useTranslations("common");
  return (
    <div className="min-w-0 rounded-xl bg-sand px-3 py-2.5">
      <div className="truncate text-[11px] font-semibold text-ink-3">{label}</div>
      <div className={`num mt-1 whitespace-nowrap font-extrabold leading-none tracking-tight ${value === "—" ? "text-sm text-ink-3" : "text-[22px]"}`}>
        {value === "—" ? tc("noData") : num != null ? <CountUp value={num} /> : value}
        {unit && <span className="ml-1 text-xs font-semibold text-ink-3">{unit}</span>}
      </div>
      <div className="mt-1.5">{badge}</div>
    </div>
  );
}

export default function RegionPanel({
  region: r,
  national,
  peers,
  onSelect,
  fit,
  overBudget,
}: {
  region: Region;
  national: National;
  peers: Region[];
  onSelect: (id: string) => void;
  fit: number | null;
  overBudget: boolean;
}) {
  const t = useTranslations("panel");
  const tt = useTranslations("tags");
  const ttr = useTranslations("terrain");
  const tc = useTranslations("common");
  const locale = useLocale();
  const ai = locale === "en" && r.ai_en ? r.ai_en : r.ai;
  const [tab, setTab] = useState<Tab>("prices");
  const mainPrice = r.prices.menzil_kohne ?? r.prices.menzil_yeni;
  const scope = r.level === "rayon" ? t("scopeCountry") : t("scopeBaku");

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-ink-3">{r.level === "rayon" ? (r.id === "az-baki" ? t("kindCapital") : t("kindRayon")) : t("kindBaku")}</div>
          <h2 className="truncate text-[34px] font-extrabold leading-tight tracking-[-0.035em]">{r.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
            {r.nature.terrain && <span className="rounded-full bg-sand px-2 py-0.5 font-semibold">{ttr(r.nature.terrain)}</span>}
            {r.nature.coastal && <span className="rounded-full bg-caspian/10 px-2 py-0.5 font-semibold text-caspian">{t("coastal")}</span>}
            <span className="num">{fmt(r.area_km2)} km²</span>
            {ai?.tags.map((g) => (
              <span key={g.tag} title={g.reason} className="rounded-full border border-green/40 px-2 py-0.5 font-semibold text-green">
                {tt(g.tag)}
              </span>
            ))}
          </div>
        </div>
        {fit != null && (
          <div className="shrink-0 text-right">
            <div className="text-[11px] font-semibold text-ink-3">{t("yourFit")}</div>
            <div className={`num text-4xl font-extrabold leading-none ${overBudget ? "text-pomegranate" : "text-green"}`}>{fit}</div>
            {overBudget && <div className="text-[11px] font-semibold text-pomegranate">{t("overBudget")}</div>}
          </div>
        )}
      </div>
      {r.coverage.per_capita === "unreliable" && r.coverage.note && (
        <div className="mt-3 rounded-lg border border-pomegranate/40 bg-pomegranate/10 px-3 py-2 text-xs leading-snug text-ink-2">
          <b className="text-pomegranate">{t("mismatchTitle")}</b> {locale === "en" && r.coverage.note_en ? r.coverage.note_en : r.coverage.note}
        </div>
      )}
      {r.coverage.osm !== "yüksək" && (
        <div className="mt-3 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs leading-snug text-ink-2">
          <b className="text-amber">{t("coverageTitle", { level: t(`coverageLevel.${r.coverage.osm}`) })}</b> {t("coverageBody")}
        </div>
      )}

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-3">
        <Kpi label={t("kpi.population")} value={fmt(r.population.v)} num={r.population.v} badge={<Badge kind="official" />} />
        <Kpi label={t("kpi.density")} value={fmt(r.density.v)} num={r.density.v} unit="/km²" badge={<Badge kind="official" />} />
        <Kpi label={t("kpi.avgPrice")} value={mainPrice?.value != null ? fmtAZN(mainPrice.value) : "—"} badge={mainPrice ? <Badge kind={priceBadge(mainPrice)} /> : <span className="text-[10px] text-ink-3">{tc("none")}</span>} />
        <Kpi label={r.transport.metro ? t("kpi.metro") : t("kpi.stops")} value={fmt(r.transport.metro || r.transport.bus_stops)} badge={<Badge kind="osm" />} />
        <Kpi label={t("kpi.routes")} value={fmt(r.transport.bus_routes)} num={r.transport.bus_routes} badge={<Badge kind="osm" />} />
        <Kpi label={t("kpi.paved")} value={fmt(r.roads.paved_known_pct)} unit={r.roads.paved_known_pct != null ? "%" : undefined} badge={<Badge kind="osm" />} />
      </div>

      {/* Tabs */}
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-sand-3" role="tablist">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px shrink-0 border-b-2 px-2.5 py-2 text-sm font-bold ${tab === k ? "border-caspian text-caspian" : "border-transparent text-ink-3 hover:text-ink"}`}>
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>
      <div className="pt-4">
        {tab === "prices" && <PricesTab r={r} national={national} scope={scope} />}
        {tab === "services" && <ServicesTab r={r} national={national} scope={scope} />}
        {tab === "transport" && <TransportTab r={r} national={national} />}
        {tab === "roads" && <RoadsTab r={r} />}
        {tab === "nature" && <NatureTab r={r} national={national} />}
        {tab === "dna" && <DnaTab r={r} national={national} peers={peers} onSelect={onSelect} scope={scope} />}
      </div>
    </div>
  );
}

function PricesTab({ r, national, scope }: { r: Region; national: National; scope: string }) {
  const types: PropertyType[] = ["menzil_yeni", "menzil_kohne", "heyet_evi", "obyekt"];
  const max = Math.max(...types.map((t) => Math.max(r.prices[t]?.value ?? 0, national.prices[t] ?? 0)), 1);
  const land = r.prices.torpaq;
  const anyMock = Object.values(r.prices).some((p) => p?.confidence === "mock");
  const t = useTranslations("panel");
  const tp = useTranslations("property");
  const tc = useTranslations("common");
  const locale = useLocale();
  if (!Object.keys(r.prices).length)
    return (
      <p className="text-sm text-ink-2">
        {t.rich("noPrices", { link: (c) => <a className="underline" href={locale === "en" ? "/en/menbeler" : "/menbeler"}>{c}</a> })}
      </p>
    );
  return (
    <div>
      <div className="space-y-3">
        {types.map((pt) => {
          const p = r.prices[pt];
          const nat = national.prices[pt];
          return (
            <div key={pt}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ink-2">{tp(pt)}</span>
                <span className="flex items-center gap-1.5">
                  <span className="num text-sm font-extrabold">{p?.value != null ? fmtAZN(p.value, "m²") : tc("noData")}</span>
                  {p && <Badge kind={priceBadge(p)} />}
                </span>
              </div>
              <div className="relative mt-1 h-3 rounded-sm bg-sand">
                {p?.value != null && <div className={`h-3 rounded-sm ${p.confidence === "mock" ? "bg-pomegranate/35" : "bg-pomegranate"}`} style={{ width: `${(p.value / max) * 100}%` }} />}
                {nat != null && <div className="absolute -top-1 h-5 w-0.5 bg-ink" style={{ left: `${(nat / max) * 100}%` }} title={t("medianTip", { scope, v: fmtAZN(nat, "m²") })} />}
              </div>
              {p && p.confidence !== "mock" && (
                <div className="mt-0.5 text-[10px] text-ink-3">
                  {t("source")}{" "}
                  {p.source_url ? (
                    <a href={p.source_url} target="_blank" rel="noreferrer" className="underline">
                      {localizeSource(p.source, locale)}
                    </a>
                  ) : (
                    localizeSource(p.source, locale)
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-3">
        <span className="inline-block h-3 w-0.5 bg-ink" /> {scope}
        <span className="ml-3 inline-block h-2 w-4 rounded-sm bg-pomegranate/35" /> {t("demoValue")}
      </div>
      {land && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-sand px-3 py-2.5">
          <div>
            <div className="text-xs font-semibold text-ink-2">{t("land")}</div>
            <div className="num text-xl font-extrabold">{land.value != null ? fmtAZN(land.value, "sot") : "—"}</div>
          </div>
          <div className="text-right text-[11px] text-ink-3">
            <Badge kind={priceBadge(land)} />
            <div className="num mt-1">{scope}: {fmtAZN(national.prices.torpaq)}</div>
          </div>
        </div>
      )}
      {r.listings && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-sand px-3 py-2.5">
            <div className="text-[11px] font-semibold text-ink-3">{t("deedShare")}</div>
            <div className="num text-xl font-extrabold">{r.listings.deed_share}%</div>
            <div className="text-[10px] text-ink-3">{t("listingsN", { n: r.listings.n, period: r.listings.period })}</div>
          </div>
          <div className="rounded-xl bg-sand px-3 py-2.5">
            <div className="text-[11px] font-semibold text-ink-3">{t("mortgageShare")}</div>
            <div className="num text-xl font-extrabold">{r.listings.mortgage_share}%</div>
            <Badge kind="sample" />
          </div>
        </div>
      )}
      {anyMock && <p className="mt-3 text-[11px] leading-snug text-ink-3">{t("demoNote")}</p>}
    </div>
  );
}

function ServicesTab({ r, national, scope }: { r: Region; national: National; scope: string }) {
  const keys = ["pharmacy", "grocery", "food", "school", "kindergarten", "university", "hospital", "clinic", "bank_atm", "sport", "park", "mall", "bazaar", "fuel"] as const;
  const t = useTranslations("panel");
  const tp = useTranslations("poi");
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[11px] text-ink-3">
        <span>{t("per10kVs", { scope })}</span>
        <Badge kind="osm" />
      </div>
      <div className="space-y-1.5">
        {keys.map((k) => {
          const v = r.per10k[k];
          const n = national.per10k[k];
          const ratio = v != null && n ? v / n - 1 : null;
          const w = ratio == null ? 0 : Math.min(1, Math.abs(ratio)) * 50;
          return (
            <div key={k} className="grid grid-cols-[120px_1fr_70px] items-center gap-2 text-xs" title={t("serviceTip", { name: tp(k), count: fmt(r.pois[k]), scope, nat: fmt(n, 2) })}>
              <span className="truncate font-semibold text-ink-2">{tp(k)}</span>
              <div className="relative h-3 bg-sand">
                <div className="absolute left-1/2 top-0 h-3 w-px bg-ink-3" />
                {ratio != null && <div className={`absolute top-0 h-3 ${ratio >= 0 ? "bg-green" : "bg-pomegranate"}`} style={ratio >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />}
              </div>
              <span className="num text-right">
                <b>{fmt(v, 1)}</b> <span className="text-ink-3">/ {fmt(n, 1)}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-ink-3">
        <span>{t("fewer")}</span>
        <span>{t("more")}</span>
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-sand px-3 py-2.5">
      <div className="text-[11px] font-semibold text-ink-3">{label}</div>
      <div className="num text-2xl font-extrabold leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-ink-3">{sub}</div>}
    </div>
  );
}

function TransportTab({ r, national }: { r: Region; national: National }) {
  const tr = r.transport;
  const t = useTranslations("panel");
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Badge kind="osm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Tile label={t("kpi.metro")} value={fmt(tr.metro)} />
        <Tile label={t("rail")} value={fmt(tr.rail)} />
        <Tile label={t("busStop")} value={fmt(tr.bus_stops)} sub={t("per10kSub", { v: fmt(r.per10k.bus_stops, 1) })} />
        <Tile label={t("routesLong")} value={fmt(tr.bus_routes)} sub={t("medianSub", { v: fmt(national.bus_routes) })} />
        {tr.nearest_metro_km != null && <Tile label={t("nearestMetro")} value={`${fmt(tr.nearest_metro_km, 1)} km`} sub={t("straightLine")} />}
      </div>
      {tr.route_refs && tr.route_refs.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-ink-2">{t("routesHere")}</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tr.route_refs.map((ref) => (
              <span key={ref} className="num rounded bg-caspian/10 px-1.5 py-0.5 text-[11px] font-bold text-caspian">
                {ref}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-[11px] leading-snug text-ink-3">{t("routesNote")}</p>
    </div>
  );
}

function RoadsTab({ r }: { r: Region }) {
  const { total_km, paved_pct, unpaved_pct, unknown_pct, paved_known_pct } = r.roads;
  const t = useTranslations("panel");
  if (!total_km) return <p className="text-sm text-ink-2">{t("noRoads")}</p>;
  const parts = [
    { k: t("paved"), v: paved_pct ?? 0, c: "bg-caspian" },
    { k: t("unpaved"), v: unpaved_pct ?? 0, c: "bg-amber" },
    { k: t("unknownSurface"), v: unknown_pct ?? 0, c: "bg-sand-3" },
  ];
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-semibold text-ink-3">{t("roadLength")}</div>
          <div className="num text-3xl font-extrabold">{fmt(total_km)} km</div>
        </div>
        <Badge kind="osm" />
      </div>
      <div className="mt-3 flex h-5 overflow-hidden rounded">
        {parts.map((p) => (
          <div key={p.k} className={p.c} style={{ width: `${p.v}%` }} title={`${p.k}: ${fmt(p.v, 1)}%`} />
        ))}
      </div>
      <div className="mt-2 space-y-1 text-xs">
        {parts.map((p) => (
          <div key={p.k} className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${p.c}`} />
            <span className="flex-1 text-ink-2">{p.k}</span>
            <span className="num font-bold">{fmt(p.v, 1)}%</span>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-sand px-3 py-2 text-xs text-ink-2">
        {t.rich("roadNote", { paved: fmt(paved_known_pct, 0), unknown: fmt(unknown_pct, 0), b: (c) => <b className="num">{c}</b> })}
      </div>
    </div>
  );
}

const LC_KEYS = ["forest", "farmland", "water", "beach", "residential", "industrial", "grass", "park"];
const LC_COLOR: Record<string, string> = { forest: "#2e6b4e", farmland: "#c9b26b", water: "#3d7a8c", beach: "#e3cf9c", residential: "#b9a58c", industrial: "#7d6f73", grass: "#8db58f", park: "#5d9b6f", other: "#ddd5c3" };

function NatureTab({ r, national }: { r: Region; national: National }) {
  const lc = Object.entries(r.nature.landcover).sort((a, b) => b[1] - a[1]);
  const covered = lc.reduce((s, [, v]) => s + v, 0);
  const t = useTranslations("panel");
  const tc = useTranslations("common");
  const pie = [...lc.map(([k, v]) => ({ k, name: LC_KEYS.includes(k) ? t(`lc.${k as "forest"}`) : k, v })), { k: "other", name: t("lc.other"), v: Math.max(0, 100 - covered) }];
  const { elev_min, elev_mean, elev_max } = r.nature;
  const pm = r.air.pm25;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-xs font-semibold text-ink-2">
          {t("landcover")} <Badge kind="osm" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-36 w-36 shrink-0">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pie} dataKey="v" nameKey="name" innerRadius={38} outerRadius={64} stroke="none" isAnimationActive={false}>
                  {pie.map((p) => (
                    <Cell key={p.k} fill={LC_COLOR[p.k] ?? "#999"} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `${fmt(Number(v), 1)}%`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex-1 space-y-0.5 text-xs">
            {pie.map((p) => (
              <li key={p.k} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LC_COLOR[p.k] }} />
                <span className="flex-1 text-ink-2">{p.name}</span>
                <span className="num font-bold">{fmt(p.v, 1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between text-xs font-semibold text-ink-2">
          {t("elevation")} <Badge kind="computed" />
        </div>
        {elev_mean != null ? (
          <div className="mt-2">
            <div className="relative h-2 rounded bg-gradient-to-r from-[#8db58f] via-[#c9b26b] to-[#7d6f73]">
              {[elev_min, elev_mean, elev_max].map((e, i) => (
                <div key={i} className={`absolute -top-1 h-4 w-1 rounded ${i === 1 ? "bg-ink" : "bg-ink-3"}`} style={{ left: `${Math.min(99, Math.max(0, ((e! + 30) / 4500) * 100))}%` }} />
              ))}
            </div>
            <div className="num mt-1 flex justify-between text-xs">
              <span>{t("elevMin", { v: fmt(elev_min) })}</span>
              <b>{t("elevMean", { v: fmt(elev_mean) })}</b>
              <span>{t("elevMax", { v: fmt(elev_max) })}</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-3">{tc("noData")}</p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Tile label={t("julyMax")} value={r.climate.july_max_c != null ? `${fmt(r.climate.july_max_c, 1)}°` : "—"} />
        <Tile label={t("janMin")} value={r.climate.jan_min_c != null ? `${fmt(r.climate.jan_min_c, 1)}°` : "—"} />
        <Tile label={t("precip")} value={r.climate.precip_mm != null ? `${fmt(r.climate.precip_mm)}` : "—"} sub="mm" />
      </div>
      <div className="rounded-xl bg-sand px-3 py-2.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-ink-3">
          {t("pm")} <Badge kind="model" />
        </div>
        <div className="num text-2xl font-extrabold">
          {pm != null ? fmt(pm, 1) : "—"} <span className="text-xs font-semibold text-ink-3">µg/m³</span>
        </div>
        {pm != null && (
          <div className="relative mt-2 h-2 rounded bg-sand-3">
            <div className={`h-2 rounded ${pm > 15 ? "bg-pomegranate" : pm > 5 ? "bg-amber" : "bg-green"}`} style={{ width: `${Math.min(100, (pm / 40) * 100)}%` }} />
            <div className="absolute -top-1 h-4 w-0.5 bg-green" style={{ left: `${(5 / 40) * 100}%` }} title={t("who")} />
          </div>
        )}
        <div className="mt-1 text-[10px] text-ink-3">{t("pmNote", { median: fmt(national.pm25, 1) })}</div>
      </div>
    </div>
  );
}

function DnaTab({ r, national, peers, onSelect, scope }: { r: Region; national: National; peers: Region[]; onSelect: (id: string) => void; scope: string }) {
  const t = useTranslations("panel");
  const ti = useTranslations("index");
  const data = INDEX_KEYS.map((k) => ({
    k: ti(k),
    region: r.indices[k as keyof typeof r.indices] ?? 0,
    nat: national.indices[k as keyof typeof national.indices] ?? 50,
  }));
  const sim = similarCheaper(r, peers);
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-ink-3">
        <span>{t("dnaNote")}</span>
        <Badge kind="computed" />
      </div>
      <div className="h-72">
        <ResponsiveContainer>
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="var(--sand-3)" />
            <PolarAngleAxis dataKey="k" tick={{ fontSize: 10, fill: "var(--ink-2)" }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name={scope} dataKey="nat" stroke="var(--ink-3)" fill="var(--ink-3)" fillOpacity={0.08} strokeDasharray="4 3" isAnimationActive={false} />
            <Radar name={r.name} dataKey="region" stroke="var(--caspian)" fill="var(--caspian)" fillOpacity={0.3} strokeWidth={2} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 text-sm font-extrabold">{t("similar")}</div>
      {sim.length ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {sim.map((s) => (
            <button key={s.region.id} onClick={() => onSelect(s.region.id)} className="rounded-xl border border-sand-3 bg-sand px-3 py-2 text-left hover:border-caspian">
              <div className="truncate text-sm font-bold">{s.region.name}</div>
              <div className="num text-xs text-ink-2">
                {t("similarity", { price: fmtAZN(s.price, "m²"), pct: fmt(s.sim * 100) })}
              </div>
              <Badge kind={priceBadge(s.region.prices.menzil_kohne)} className="mt-1" />
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-ink-3">{t("noSimilar")}</p>
      )}
    </div>
  );
}
