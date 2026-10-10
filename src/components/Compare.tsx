"use client";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Region } from "@/lib/types";
import { fmt, priceBadge } from "@/lib/metrics";

const INDEX_KEYS = ["rahatliq", "neqliyyat", "tehsil", "sehiyye", "tebiet", "infrastruktur", "elcatanliq"] as const;
import { Badge } from "./Badge";

const COLORS = ["var(--caspian)", "var(--pomegranate)", "var(--green)"];
type CmpResult = { summary: string; per_region: { id: string; verdict: string }[]; who_should_pick: { persona: string; region_id: string; why: string }[] };

export default function Compare() {
  const [all, setAll] = useState<Region[]>([]);
  const [ids, setIds] = useState<string[]>(["bk-nesimi", "bk-xetai", "bk-bineqedi"]);
  const [ai, setAi] = useState<CmpResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useTranslations("compare");
  const ti = useTranslations("index");
  const tl = useTranslations("panel");
  const locale = useLocale();

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("ids");
    if (q) setIds(q.split(",").slice(0, 3));
    Promise.all([fetch("/data/regions-baku.json").then((r) => r.json()), fetch("/data/regions-az.json").then((r) => r.json())]).then(([b, a]) => setAll([...b, ...a]));
  }, []);

  const rs = ids.map((id) => all.find((r) => r.id === id)).filter((r): r is Region => !!r);
  const chart = INDEX_KEYS.map((k) => Object.fromEntries([["k", ti(k)], ...rs.map((r) => [r.name, r.indices[k as keyof Region["indices"]] ?? 0])]));

  async function runAI() {
    setBusy(true);
    setAi(null);
    setMsg(null);
    try {
      const res = await fetch("/api/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, locale }) });
      const j = await res.json();
      if (j.result) setAi(j.result);
      else setMsg(j.message ?? j.error ?? t("aiFail"));
    } finally {
      setBusy(false);
    }
  }

  const rows: { label: string; get: (r: Region) => string; badge: (r: Region) => React.ReactNode }[] = [
    { label: t("row.population"), get: (r) => fmt(r.population.v), badge: () => <Badge kind="official" /> },
    { label: t("row.density"), get: (r) => fmt(r.density.v), badge: () => <Badge kind="official" /> },
    { label: t("row.old"), get: (r) => fmt(r.prices.menzil_kohne?.value), badge: (r) => (r.prices.menzil_kohne ? <Badge kind={priceBadge(r.prices.menzil_kohne)} /> : null) },
    { label: t("row.new"), get: (r) => fmt(r.prices.menzil_yeni?.value), badge: (r) => (r.prices.menzil_yeni ? <Badge kind={priceBadge(r.prices.menzil_yeni)} /> : null) },
    { label: t("row.school"), get: (r) => fmt(r.per10k.school, 1), badge: () => <Badge kind="osm" /> },
    { label: t("row.pharmacy"), get: (r) => fmt(r.per10k.pharmacy, 1), badge: () => <Badge kind="osm" /> },
    { label: t("row.metro"), get: (r) => fmt(r.transport.metro), badge: () => <Badge kind="osm" /> },
    { label: t("row.routes"), get: (r) => fmt(r.transport.bus_routes), badge: () => <Badge kind="osm" /> },
    { label: t("row.paved"), get: (r) => fmt(r.roads.paved_known_pct), badge: () => <Badge kind="osm" /> },
    { label: t("row.pm"), get: (r) => fmt(r.air.pm25, 1), badge: () => <Badge kind="model" /> },
    { label: t("row.july"), get: (r) => fmt(r.climate.july_max_c, 1), badge: () => <Badge kind="model" /> },
    { label: t("row.osm"), get: (r) => tl(`coverageLevel.${r.coverage.osm}`), badge: () => null },
  ];
  const baku = all.filter((r) => r.level === "baku_district");
  const az = all.filter((r) => r.level === "rayon").sort((a, b) => a.name.localeCompare(b.name, "az"));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
      <Link href="/xerite" className="text-sm font-bold text-caspian">{t("back")}</Link>
      <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.035em] md:text-5xl">{t("h1")}</h1>
      <div className="mt-6 flex flex-wrap gap-3">
        {[0, 1, 2].map((i) => (
          <select
            key={i}
            aria-label={t("areaN", { n: i + 1 })}
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
            <optgroup label={t("groupBaku")}>{baku.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
            <optgroup label={t("groupAz")}>{az.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
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
            <p className="text-[11px] text-ink-3">{t("indexNote")}</p>
          </section>

          <section className="mt-6 overflow-x-auto rounded-2xl border border-sand-3 bg-sand-2">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-sand-3">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-ink-3">{t("indicator")}</th>
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
              <h2 className="text-lg font-extrabold text-caspian">{t("aiTitle")}</h2>
              <button onClick={runAI} disabled={busy} className="h-10 rounded-lg bg-caspian px-4 text-sm font-bold text-sand-2 disabled:opacity-60">{busy ? t("aiBusy") : t("aiRun")}</button>
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
                  <div className="font-extrabold">{t("whoPicks")}</div>
                  <ul className="mt-1 space-y-1">
                    {ai.who_should_pick.map((w, i) => (
                      <li key={i}><b>{w.persona}</b> → {all.find((r) => r.id === w.region_id)?.name ?? w.region_id}: <span className="text-ink-2">{w.why}</span></li>
                    ))}
                  </ul>
                </div>
                <p className="text-[11px] text-ink-3">{t("aiNote")}</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
