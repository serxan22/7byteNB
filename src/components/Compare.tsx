"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Region } from "@/lib/types";
import { fmt, INDEX_LABEL, priceBadge } from "@/lib/metrics";
import { Badge } from "./Badge";

const COLORS = ["var(--caspian)", "var(--pomegranate)", "var(--green)"];
type CmpResult = { summary: string; per_region: { id: string; verdict: string }[]; who_should_pick: { persona: string; region_id: string; why: string }[] };

export default function Compare() {
  const [all, setAll] = useState<Region[]>([]);
  const [ids, setIds] = useState<string[]>(["bk-nesimi", "bk-xetai", "bk-bineqedi"]);
  const [ai, setAi] = useState<CmpResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("ids");
    if (q) setIds(q.split(",").slice(0, 3));
    Promise.all([fetch("/data/regions-baku.json").then((r) => r.json()), fetch("/data/regions-az.json").then((r) => r.json())]).then(([b, a]) => setAll([...b, ...a]));
  }, []);

  const rs = ids.map((id) => all.find((r) => r.id === id)).filter((r): r is Region => !!r);
  const chart = Object.keys(INDEX_LABEL).map((k) => Object.fromEntries([["k", INDEX_LABEL[k]], ...rs.map((r) => [r.name, r.indices[k as keyof Region["indices"]] ?? 0])]));

  async function runAI() {
    setBusy(true);
    setAi(null);
    setMsg(null);
    try {
      const res = await fetch("/api/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
      const j = await res.json();
      if (j.result) setAi(j.result);
      else setMsg(j.message ?? j.error ?? "AI müqayisəsi alınmadı");
    } finally {
      setBusy(false);
    }
  }

  const rows: { label: string; get: (r: Region) => string; badge: (r: Region) => React.ReactNode }[] = [
    { label: "Əhali", get: (r) => fmt(r.population.v), badge: () => <Badge kind="official" /> },
    { label: "Sıxlıq, nəfər/km²", get: (r) => fmt(r.density.v), badge: () => <Badge kind="official" /> },
    { label: "Köhnə tikili, ₼/m²", get: (r) => fmt(r.prices.menzil_kohne?.value), badge: (r) => (r.prices.menzil_kohne ? <Badge kind={priceBadge(r.prices.menzil_kohne)} /> : null) },
    { label: "Yeni tikili, ₼/m²", get: (r) => fmt(r.prices.menzil_yeni?.value), badge: (r) => (r.prices.menzil_yeni ? <Badge kind={priceBadge(r.prices.menzil_yeni)} /> : null) },
    { label: "Məktəb / 10 min", get: (r) => fmt(r.per10k.school, 1), badge: () => <Badge kind="osm" /> },
    { label: "Aptek / 10 min", get: (r) => fmt(r.per10k.pharmacy, 1), badge: () => <Badge kind="osm" /> },
    { label: "Metro stansiyası", get: (r) => fmt(r.transport.metro), badge: () => <Badge kind="osm" /> },
    { label: "Marşrut", get: (r) => fmt(r.transport.bus_routes), badge: () => <Badge kind="osm" /> },
    { label: "Asfalt yollar, %", get: (r) => fmt(r.roads.paved_known_pct), badge: () => <Badge kind="osm" /> },
    { label: "PM2.5, µg/m³", get: (r) => fmt(r.air.pm25, 1), badge: () => <Badge kind="model" /> },
    { label: "İyul, orta maks °C", get: (r) => fmt(r.climate.july_max_c, 1), badge: () => <Badge kind="model" /> },
    { label: "OSM əhatəsi", get: (r) => r.coverage.osm, badge: () => null },
  ];
  const baku = all.filter((r) => r.level === "baku_district");
  const az = all.filter((r) => r.level === "rayon").sort((a, b) => a.name.localeCompare(b.name, "az"));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
      <Link href="/" className="text-sm font-bold text-caspian">← Xəritəyə qayıt</Link>
      <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.035em] md:text-5xl">Əraziləri müqayisə et</h1>
      <div className="mt-6 flex flex-wrap gap-3">
        {[0, 1, 2].map((i) => (
          <select
            key={i}
            aria-label={`Ərazi ${i + 1}`}
            value={ids[i] ?? ""}
            onChange={(e) => {
              const next = [...ids];
              if (e.target.value) next[i] = e.target.value;
              else next.splice(i, 1);
              setIds(next.filter(Boolean));
              setAi(null);
            }}
            className="h-10 rounded-lg border-2 bg-sand-2 px-2 text-sm font-semibold"
            style={{ borderColor: COLORS[i] }}
          >
            {i === 2 && <option value="">— yoxdur —</option>}
            <optgroup label="Bakı rayonları">{baku.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
            <optgroup label="Rayonlar və şəhərlər">{az.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
          </select>
        ))}
      </div>

      {rs.length >= 2 && (
        <>
          <section className="mt-8 rounded-2xl border border-sand-3 bg-sand-2 p-4 md:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">7 indeks, 0–100</h2>
              <Badge kind="computed" />
            </div>
            <div className="mt-2 h-80">
              <ResponsiveContainer>
                <BarChart data={chart} margin={{ left: -20 }}>
                  <CartesianGrid vertical={false} stroke="var(--sand-3)" />
                  <XAxis dataKey="k" tick={{ fontSize: 11, fill: "var(--ink-2)" }} interval={0} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--ink-3)" }} />
                  <Tooltip contentStyle={{ background: "var(--sand-2)", border: "1px solid var(--sand-3)", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {rs.map((r, i) => <Bar key={r.id} dataKey={r.name} fill={COLORS[i]} radius={[3, 3, 0, 0]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-ink-3">Rayonlar ölkə rayonları, Bakı rayonları isə bir-biri ilə müqayisədə faiz dərəcəsidir — fərqli səviyyələrin indeksləri birbaşa müqayisə olunmur.</p>
          </section>

          <section className="mt-6 overflow-x-auto rounded-2xl border border-sand-3 bg-sand-2">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-sand-3">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-ink-3">Göstərici</th>
                  {rs.map((r, i) => <th key={r.id} className="px-4 py-3 text-right text-base font-extrabold" style={{ color: COLORS[i] }}>{r.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-b border-sand-3/60 last:border-0">
                    <td className="px-4 py-2 text-ink-2">{row.label}</td>
                    {rs.map((r) => (
                      <td key={r.id} className="num px-4 py-2 text-right font-bold">
                        <span className="mr-1.5">{row.get(r)}</span>
                        {row.badge(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-6 rounded-2xl border-2 border-caspian/25 bg-sand-2 p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-caspian">AI müqayisəsi</h2>
              <button onClick={runAI} disabled={busy} className="h-10 rounded-lg bg-caspian px-4 text-sm font-bold text-sand-2 disabled:opacity-60">{busy ? "Müqayisə edilir…" : "AI ilə müqayisə et"}</button>
            </div>
            {msg && <p className="mt-3 text-sm text-pomegranate">{msg}</p>}
            {ai && (
              <div className="mt-4 space-y-4 text-sm leading-relaxed">
                <p className="max-w-[75ch] text-[15px]">{ai.summary}</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {ai.per_region.map((p) => {
                    const i = ids.indexOf(p.id);
                    return (
                      <div key={p.id} className="rounded-xl bg-sand p-3">
                        <div className="font-extrabold" style={{ color: COLORS[i] ?? "inherit" }}>{all.find((r) => r.id === p.id)?.name ?? p.id}</div>
                        <p className="mt-1 text-ink-2">{p.verdict}</p>
                      </div>
                    );
                  })}
                </div>
                <div>
                  <div className="font-extrabold">Kimə hansı</div>
                  <ul className="mt-1 space-y-1">
                    {ai.who_should_pick.map((w, i) => (
                      <li key={i}><b>{w.persona}</b> → {all.find((r) => r.id === w.region_id)?.name ?? w.region_id}: <span className="text-ink-2">{w.why}</span></li>
                    ))}
                  </ul>
                </div>
                <p className="text-[11px] text-ink-3">AI yalnız yuxarıdakı göstəricilərdən istifadə edir; “Demo” qiymətlər real deyil.</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
