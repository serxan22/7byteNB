"use client";
import { useState } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Legend, PieChart, Pie, Cell, Tooltip } from "recharts";
import type { National, PropertyType, Region } from "@/lib/types";
import { fmt, INDEX_LABEL, POI_LABEL, PROPERTY_LABEL, priceBadge } from "@/lib/metrics";
import { similarCheaper } from "@/lib/score";
import { Badge } from "./Badge";
import CountUp from "./CountUp";

const TAG_LABEL: Record<string, string> = {
  aile_dostu: "Ailə üçün",
  genc_pesekar: "Gənc peşəkar",
  telebe: "Tələbə",
  teqaudcu: "Təqaüdçü",
  biznes_furseti: "Biznes fürsəti",
  tebiet_sakitlik: "Təbiət və sakitlik",
  budce_dostu: "Büdcəyə uyğun",
  premium: "Premium",
  inkisafda: "İnkişafda",
  turizm: "Turizm",
};
export { TAG_LABEL };

const TABS = ["Qiymətlər", "Xidmətlər", "Nəqliyyat", "Yollar", "Təbiət", "DNT"] as const;
type Tab = (typeof TABS)[number];

function Kpi({ label, value, unit, badge, num }: { label: string; value: string; unit?: string; badge: React.ReactNode; num?: number | null }) {
  return (
    <div className="min-w-0 rounded-xl bg-sand px-3 py-2.5">
      <div className="truncate text-[11px] font-semibold text-ink-3">{label}</div>
      <div className={`num mt-1 whitespace-nowrap font-extrabold leading-none tracking-tight ${value === "—" ? "text-sm text-ink-3" : "text-[22px]"}`}>
        {value === "—" ? "məlumat yoxdur" : num != null ? <CountUp value={num} /> : value}
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
  const [tab, setTab] = useState<Tab>("Qiymətlər");
  const mainPrice = r.prices.menzil_kohne ?? r.prices.menzil_yeni;
  const scope = r.level === "rayon" ? "ölkə medianı" : "Bakı medianı";

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-ink-3">{r.level === "rayon" ? (r.id === "az-baki" ? "Paytaxt" : "Rayon / şəhər") : "Bakı şəhərinin rayonu"}</div>
          <h2 className="truncate text-[34px] font-extrabold leading-tight tracking-[-0.035em]">{r.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
            {r.nature.terrain && <span className="rounded-full bg-sand px-2 py-0.5 font-semibold">{r.nature.terrain}</span>}
            {r.nature.coastal && <span className="rounded-full bg-caspian/10 px-2 py-0.5 font-semibold text-caspian">Xəzər sahili</span>}
            <span className="num">{fmt(r.area_km2)} km²</span>
            {r.ai?.tags.map((t) => (
              <span key={t.tag} title={t.reason} className="rounded-full border border-green/40 px-2 py-0.5 font-semibold text-green">
                {TAG_LABEL[t.tag] ?? t.tag}
              </span>
            ))}
          </div>
        </div>
        {fit != null && (
          <div className="shrink-0 text-right">
            <div className="text-[11px] font-semibold text-ink-3">Sənə uyğunluq</div>
            <div className={`num text-4xl font-extrabold leading-none ${overBudget ? "text-pomegranate" : "text-green"}`}>{fit}</div>
            {overBudget && <div className="text-[11px] font-semibold text-pomegranate">büdcədən baha</div>}
          </div>
        )}
      </div>
      {r.coverage.per_capita === "unreliable" && r.coverage.note && (
        <div className="mt-3 rounded-lg border border-pomegranate/40 bg-pomegranate/10 px-3 py-2 text-xs leading-snug text-ink-2">
          <b className="text-pomegranate">Əhali və xəritə uyğun gəlmir.</b> {r.coverage.note}
        </div>
      )}
      {r.coverage.osm !== "yüksək" && (
        <div className="mt-3 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs leading-snug text-ink-2">
          <b className="text-amber">OSM əhatəsi {r.coverage.osm}dır.</b> Burada az obyekt görünməsi onların olmadığını yox, xəritədə qeyd olunmadığını göstərə bilər.
        </div>
      )}

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-3">
        <Kpi label="Əhali" value={fmt(r.population.v)} num={r.population.v} badge={<Badge kind="official" />} />
        <Kpi label="Sıxlıq" value={fmt(r.density.v)} num={r.density.v} unit="/km²" badge={<Badge kind="official" />} />
        <Kpi label="Orta m² (köhnə)" value={mainPrice?.value != null ? fmt(mainPrice.value) : "—"} unit={mainPrice?.value != null ? "₼" : undefined} badge={mainPrice ? <Badge kind={priceBadge(mainPrice)} /> : <span className="text-[10px] text-ink-3">yoxdur</span>} />
        <Kpi label={r.transport.metro ? "Metro stansiyası" : "Dayanacaq"} value={fmt(r.transport.metro || r.transport.bus_stops)} badge={<Badge kind="osm" />} />
        <Kpi label="Marşrut" value={fmt(r.transport.bus_routes)} num={r.transport.bus_routes} badge={<Badge kind="osm" />} />
        <Kpi label="Asfalt yollar" value={fmt(r.roads.paved_known_pct)} unit={r.roads.paved_known_pct != null ? "%" : undefined} badge={<Badge kind="osm" />} />
      </div>

      {/* Tabs */}
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-sand-3" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px shrink-0 border-b-2 px-2.5 py-2 text-sm font-bold ${tab === t ? "border-caspian text-caspian" : "border-transparent text-ink-3 hover:text-ink"}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="pt-4">
        {tab === "Qiymətlər" && <PricesTab r={r} national={national} scope={scope} />}
        {tab === "Xidmətlər" && <ServicesTab r={r} national={national} scope={scope} />}
        {tab === "Nəqliyyat" && <TransportTab r={r} national={national} />}
        {tab === "Yollar" && <RoadsTab r={r} />}
        {tab === "Təbiət" && <NatureTab r={r} national={national} />}
        {tab === "DNT" && <DnaTab r={r} national={national} peers={peers} onSelect={onSelect} scope={scope} />}
      </div>
    </div>
  );
}

function PricesTab({ r, national, scope }: { r: Region; national: National; scope: string }) {
  const types: PropertyType[] = ["menzil_yeni", "menzil_kohne", "heyet_evi", "obyekt"];
  const max = Math.max(...types.map((t) => Math.max(r.prices[t]?.value ?? 0, national.prices[t] ?? 0)), 1);
  const land = r.prices.torpaq;
  const anyMock = Object.values(r.prices).some((p) => p?.confidence === "mock");
  if (!Object.keys(r.prices).length)
    return (
      <p className="text-sm text-ink-2">
        Bu ərazi üçün qiymət məlumatı yoxdur. Qiymətlər hazırda yalnız Bakı rayonları və 7 şəhər üçün toplanıb — <a className="underline" href="/menbeler">mənbələr</a>.
      </p>
    );
  return (
    <div>
      <div className="space-y-3">
        {types.map((t) => {
          const p = r.prices[t];
          const nat = national.prices[t];
          return (
            <div key={t}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ink-2">{PROPERTY_LABEL[t]}</span>
                <span className="flex items-center gap-1.5">
                  <span className="num text-sm font-extrabold">{p?.value != null ? `${fmt(p.value)} ₼/m²` : "məlumat yoxdur"}</span>
                  {p && <Badge kind={priceBadge(p)} />}
                </span>
              </div>
              <div className="relative mt-1 h-3 rounded-sm bg-sand">
                {p?.value != null && <div className={`h-3 rounded-sm ${p.confidence === "mock" ? "bg-pomegranate/35" : "bg-pomegranate"}`} style={{ width: `${(p.value / max) * 100}%` }} />}
                {nat != null && <div className="absolute -top-1 h-5 w-0.5 bg-ink" style={{ left: `${(nat / max) * 100}%` }} title={`${scope}: ${fmt(nat)} ₼/m²`} />}
              </div>
              {p && p.confidence !== "mock" && (
                <div className="mt-0.5 text-[10px] text-ink-3">
                  Mənbə:{" "}
                  {p.source_url ? (
                    <a href={p.source_url} target="_blank" rel="noreferrer" className="underline">
                      {p.source}
                    </a>
                  ) : (
                    p.source
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-3">
        <span className="inline-block h-3 w-0.5 bg-ink" /> {scope}
        <span className="ml-3 inline-block h-2 w-4 rounded-sm bg-pomegranate/35" /> demo dəyər
      </div>
      {land && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-sand px-3 py-2.5">
          <div>
            <div className="text-xs font-semibold text-ink-2">Torpaq (1 sot = 100 m²)</div>
            <div className="num text-xl font-extrabold">{land.value != null ? `${fmt(land.value)} ₼/sot` : "—"}</div>
          </div>
          <div className="text-right text-[11px] text-ink-3">
            <Badge kind={priceBadge(land)} />
            <div className="num mt-1">{scope}: {fmt(national.prices.torpaq)} ₼</div>
          </div>
        </div>
      )}
      {r.listings && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-sand px-3 py-2.5">
            <div className="text-[11px] font-semibold text-ink-3">Elanlarda çıxarış var</div>
            <div className="num text-xl font-extrabold">{r.listings.deed_share}%</div>
            <div className="text-[10px] text-ink-3">{fmt(r.listings.n)} elan, {r.listings.period}</div>
          </div>
          <div className="rounded-xl bg-sand px-3 py-2.5">
            <div className="text-[11px] font-semibold text-ink-3">İpotekaya uyğun elan</div>
            <div className="num text-xl font-extrabold">{r.listings.mortgage_share}%</div>
            <Badge kind="sample" />
          </div>
        </div>
      )}
      {anyMock && <p className="mt-3 text-[11px] leading-snug text-ink-3">“Demo” işarəli qiymətlər real mənbə tapılana qədər nümayiş üçündür və real bazar qiyməti kimi istifadə edilməməlidir.</p>}
    </div>
  );
}

function ServicesTab({ r, national, scope }: { r: Region; national: National; scope: string }) {
  const keys = ["pharmacy", "grocery", "food", "school", "kindergarten", "university", "hospital", "clinic", "bank_atm", "sport", "park", "mall", "bazaar", "fuel"];
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[11px] text-ink-3">
        <span>10 min sakinə düşən obyekt, {scope} ilə müqayisədə</span>
        <Badge kind="osm" />
      </div>
      <div className="space-y-1.5">
        {keys.map((k) => {
          const v = r.per10k[k];
          const n = national.per10k[k];
          const ratio = v != null && n ? v / n - 1 : null;
          const w = ratio == null ? 0 : Math.min(1, Math.abs(ratio)) * 50;
          return (
            <div key={k} className="grid grid-cols-[120px_1fr_70px] items-center gap-2 text-xs" title={`${POI_LABEL[k]}: ${r.pois[k]} obyekt (OSM). ${scope}: ${fmt(n, 2)} / 10 min`}>
              <span className="truncate font-semibold text-ink-2">{POI_LABEL[k]}</span>
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
        <span>← azdır</span>
        <span>çoxdur →</span>
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
  const t = r.transport;
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Badge kind="osm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Metro stansiyası" value={fmt(t.metro)} />
        <Tile label="Dəmiryol stansiyası" value={fmt(t.rail)} />
        <Tile label="Avtobus dayanacağı" value={fmt(t.bus_stops)} sub={`${fmt(r.per10k.bus_stops, 1)} / 10 min sakin`} />
        <Tile label="Marşrut (avtobus, mikroavtobus)" value={fmt(t.bus_routes)} sub={`median: ${fmt(national.bus_routes)}`} />
        {t.nearest_metro_km != null && <Tile label="Mərkəzdən ən yaxın metro" value={`${fmt(t.nearest_metro_km, 1)} km`} sub="düz xətt, ərazinin mərkəzindən" />}
      </div>
      {t.route_refs && t.route_refs.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-ink-2">Bu ərazidən keçən marşrutlar</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {t.route_refs.map((ref) => (
              <span key={ref} className="num rounded bg-caspian/10 px-1.5 py-0.5 text-[11px] font-bold text-caspian">
                {ref}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-[11px] leading-snug text-ink-3">Marşrutlar OSM-də xəritələnən avtobus və mikroavtobus xətləridir; regionlarda çoxu hələ xəritələnməyib.</p>
    </div>
  );
}

function RoadsTab({ r }: { r: Region }) {
  const { total_km, paved_pct, unpaved_pct, unknown_pct, paved_known_pct } = r.roads;
  if (!total_km) return <p className="text-sm text-ink-2">Yol məlumatı yoxdur.</p>;
  const parts = [
    { k: "Asfalt / beton", v: paved_pct ?? 0, c: "bg-caspian" },
    { k: "Torpaq / çınqıl", v: unpaved_pct ?? 0, c: "bg-amber" },
    { k: "Örtük qeyd olunmayıb", v: unknown_pct ?? 0, c: "bg-sand-3" },
  ];
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs font-semibold text-ink-3">Yolların ümumi uzunluğu</div>
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
        Örtüyü məlum olan yolların <b className="num">{fmt(paved_known_pct, 0)}%</b>-i asfaltdır. Örtüyü qeyd olunmayan yollar ({fmt(unknown_pct, 0)}%) hesablamaya daxil deyil. Əsas yollar, küçələr və kənd yolları (track) daxildir.
      </div>
    </div>
  );
}

const LC_LABEL: Record<string, string> = { forest: "Meşə", farmland: "Əkin / bağ", water: "Su / bataqlıq", beach: "Çimərlik / qum", residential: "Yaşayış", industrial: "Sənaye", grass: "Çəmən / kol", park: "Park" };
const LC_COLOR: Record<string, string> = { forest: "#2e6b4e", farmland: "#c9b26b", water: "#3d7a8c", beach: "#e3cf9c", residential: "#b9a58c", industrial: "#7d6f73", grass: "#8db58f", park: "#5d9b6f", other: "#ddd5c3" };

function NatureTab({ r, national }: { r: Region; national: National }) {
  const lc = Object.entries(r.nature.landcover).sort((a, b) => b[1] - a[1]);
  const covered = lc.reduce((s, [, v]) => s + v, 0);
  const pie = [...lc.map(([k, v]) => ({ k, name: LC_LABEL[k] ?? k, v })), { k: "other", name: "Xəritələnməyib / digər", v: Math.max(0, 100 - covered) }];
  const { elev_min, elev_mean, elev_max } = r.nature;
  const pm = r.air.pm25;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-xs font-semibold text-ink-2">
          Torpaq örtüyü (təxmini) <Badge kind="osm" />
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
          Hündürlük (dəniz səviyyəsindən) <Badge kind="computed" />
        </div>
        {elev_mean != null ? (
          <div className="mt-2">
            <div className="relative h-2 rounded bg-gradient-to-r from-[#8db58f] via-[#c9b26b] to-[#7d6f73]">
              {[elev_min, elev_mean, elev_max].map((e, i) => (
                <div key={i} className={`absolute -top-1 h-4 w-1 rounded ${i === 1 ? "bg-ink" : "bg-ink-3"}`} style={{ left: `${Math.min(99, Math.max(0, ((e! + 30) / 4500) * 100))}%` }} />
              ))}
            </div>
            <div className="num mt-1 flex justify-between text-xs">
              <span>min {fmt(elev_min)} m</span>
              <b>orta {fmt(elev_mean)} m</b>
              <span>maks {fmt(elev_max)} m</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-3">məlumat yoxdur</p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Tile label="İyul, orta maks" value={r.climate.july_max_c != null ? `${fmt(r.climate.july_max_c, 1)}°` : "—"} />
        <Tile label="Yanvar, orta min" value={r.climate.jan_min_c != null ? `${fmt(r.climate.jan_min_c, 1)}°` : "—"} />
        <Tile label="İllik yağıntı" value={r.climate.precip_mm != null ? `${fmt(r.climate.precip_mm)}` : "—"} sub="mm" />
      </div>
      <div className="rounded-xl bg-sand px-3 py-2.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-ink-3">
          Hava çirkliliyi PM2.5, son 30 gün <Badge kind="model" />
        </div>
        <div className="num text-2xl font-extrabold">
          {pm != null ? fmt(pm, 1) : "—"} <span className="text-xs font-semibold text-ink-3">µg/m³</span>
        </div>
        {pm != null && (
          <div className="relative mt-2 h-2 rounded bg-sand-3">
            <div className={`h-2 rounded ${pm > 15 ? "bg-pomegranate" : pm > 5 ? "bg-amber" : "bg-green"}`} style={{ width: `${Math.min(100, (pm / 40) * 100)}%` }} />
            <div className="absolute -top-1 h-4 w-0.5 bg-green" style={{ left: `${(5 / 40) * 100}%` }} title="ÜST tövsiyəsi 5 µg/m³" />
          </div>
        )}
        <div className="mt-1 text-[10px] text-ink-3">Yaşıl xətt — ÜST illik tövsiyəsi 5 µg/m³. Median: {fmt(national.pm25, 1)}. Klimat: Open-Meteo (ERA5), mərkəz nöqtəsi.</div>
      </div>
    </div>
  );
}

function DnaTab({ r, national, peers, onSelect, scope }: { r: Region; national: National; peers: Region[]; onSelect: (id: string) => void; scope: string }) {
  const data = Object.keys(INDEX_LABEL).map((k) => ({
    k: INDEX_LABEL[k],
    region: r.indices[k as keyof typeof r.indices] ?? 0,
    nat: national.indices[k as keyof typeof national.indices] ?? 50,
  }));
  const sim = similarCheaper(r, peers);
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-ink-3">
        <span>7 indeks, 0–100 (eyni səviyyədəki ərazilər arasında faiz dərəcəsi)</span>
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
      <div className="mt-2 text-sm font-extrabold">Oxşar, amma ucuz</div>
      {sim.length ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {sim.map((s) => (
            <button key={s.region.id} onClick={() => onSelect(s.region.id)} className="rounded-xl border border-sand-3 bg-sand px-3 py-2 text-left hover:border-caspian">
              <div className="truncate text-sm font-bold">{s.region.name}</div>
              <div className="num text-xs text-ink-2">
                {fmt(s.price)} ₼/m² · oxşarlıq {fmt(s.sim * 100)}%
              </div>
              <Badge kind={priceBadge(s.region.prices.menzil_kohne)} className="mt-1" />
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-ink-3">Daha ucuz oxşar ərazi tapılmadı və ya qiymət məlumatı yoxdur.</p>
      )}
    </div>
  );
}
