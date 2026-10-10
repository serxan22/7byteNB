"use client";
import { useMemo, useState } from "react";
import type { PropertyType, Region } from "@/lib/types";
import { businessGaps, trueCost, type Persona } from "@/lib/score";
import { useLocale, useTranslations } from "next-intl";
import { fmt, fmtAZN, priceBadge } from "@/lib/metrics";
import { HUB_IDS } from "@/lib/hubs";
import { Badge } from "./Badge";

const TOOLS = ["trueCost", "legal", "biz"] as const;
type ToolT = (typeof TOOLS)[number];

export default function Tools({ region, all, persona }: { region: Region; all: Region[]; persona: Persona | null }) {
  const [tool, setTool] = useState<ToolT>("trueCost");
  const tr = useTranslations("tools");
  return (
    <section className="rounded-2xl border border-sand-3 bg-sand-2 p-5 md:p-7">
      <div className="flex flex-wrap items-center gap-2" role="tablist">
        {TOOLS.map((t) => (
          <button key={t} role="tab" aria-selected={tool === t} onClick={() => setTool(t)} className={`rounded-full px-4 py-1.5 text-sm font-bold ${tool === t ? "bg-ink text-sand" : "bg-sand text-ink-2 hover:text-ink"}`}>
            {tr(`tabs.${t}`)}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tool === "trueCost" && <TrueCost region={region} all={all} persona={persona} />}
        {tool === "legal" && <LegalCheck />}
        {tool === "biz" && <BizGap region={region} all={all} />}
      </div>
    </section>
  );
}

const MODES = ["metro", "bus", "car", "walk"] as const;
const MODE_COST = { metro: 30, bus: 30, car: 220, walk: 0 } as const;

function TrueCost({ region, all, persona }: { region: Region; all: Region[]; persona: Persona | null }) {
  const [type, setType] = useState<PropertyType>(persona?.property_type && persona.property_type !== "torpaq" ? persona.property_type : "menzil_kohne");
  const [m2, setM2] = useState(persona?.desired_m2 ?? 70);
  const [hub, setHub] = useState<string>(persona?.work_hub_id ?? "bk-nesimi");
  const [mode, setMode] = useState<(typeof MODES)[number]>(persona?.mode ?? "metro");
  const tr = useTranslations("tools");
  const tp = useTranslations("property");
  const [hourly, setHourly] = useState(8);
  const hubR = all.find((r) => r.id === hub);
  const calc = (r: Region) => {
    const p = r.prices[type]?.value;
    if (!p || !hubR) return null;
    const intercity = r.level === "rayon" && r.id !== hubR.id && !(r.id === "az-baki" && hubR.level === "baku_district");
    return trueCost({ price_m2: p, m2, from: r.centroid, to: hubR.centroid, mode, intercity, monthly_transport_azn: MODE_COST[mode], hourly_value_azn: hourly });
  };
  const me = calc(region);
  const alts = useMemo(
    () =>
      all
        .filter((r) => r.level === region.level && r.id !== region.id)
        .map((r) => ({ r, c: calc(r) }))
        .filter((x) => x.c)
        .sort((a, b) => a.c!.total - b.c!.total)
        .slice(0, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, region, type, m2, hub, mode, hourly]
  );
  const rows = me ? [{ r: region, c: me }, ...alts.map((a) => ({ r: a.r, c: a.c! }))] : alts.map((a) => ({ r: a.r, c: a.c! }));
  const max = Math.max(...rows.map((x) => x.c.total), 1);
  const input = "h-9 rounded-lg border border-sand-3 bg-sand px-2 text-sm";
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="space-y-3 text-sm">
        <p className="text-ink-2">{tr("tcIntro")}</p>
        <label className="flex items-center justify-between gap-2">{tr("type")}
          <select value={type} onChange={(e) => setType(e.target.value as PropertyType)} className={input}>
            {(["menzil_yeni", "menzil_kohne", "heyet_evi", "obyekt"] as PropertyType[]).map((t) => <option key={t} value={t}>{tp(t)}</option>)}
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">{tr("area")}
          <input type="number" min={20} max={500} value={m2} onChange={(e) => setM2(Number(e.target.value) || 0)} className={`${input} w-24`} />
        </label>
        <label className="flex items-center justify-between gap-2">{tr("work")}
          <select value={hub} onChange={(e) => setHub(e.target.value)} className={input}>
            {HUB_IDS.map((id) => <option key={id} value={id}>{all.find((r) => r.id === id)?.name ?? id}</option>)}
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">{tr("transport")}
          <select value={mode} onChange={(e) => setMode(e.target.value as (typeof MODES)[number])} className={input}>
            {MODES.map((k) => <option key={k} value={k}>{tr(`mode.${k}`)}</option>)}
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">{tr("hourly")}
          <input type="number" min={0} max={200} value={hourly} onChange={(e) => setHourly(Number(e.target.value) || 0)} className={`${input} w-24`} />
        </label>
        <p className="text-[11px] leading-snug text-ink-3">{tr("model", { cost: fmtAZN(MODE_COST[mode]) })}</p>
      </div>
      <div>
        {rows.length === 0 && <p className="text-sm text-ink-3">{tr("noPrice")}</p>}
        <div className="space-y-3">
          {rows.map(({ r, c }, i) => (
            <div key={r.id}>
              <div className="flex items-baseline justify-between text-sm">
                <span className={i === 0 && me ? "font-extrabold" : "font-semibold text-ink-2"}>
                  {r.name} {i === 0 && me && <span className="text-xs text-ink-3">{tr("selected")}</span>}
                  <span className="ml-2 text-xs font-normal text-ink-3">{tr("trip", { km: fmt(c.km, 1), min: fmt(c.oneWayMin) })}</span>
                </span>
                <span className="num font-extrabold">{fmtAZN(c.total)}</span>
              </div>
              <div className="mt-1 flex h-4 overflow-hidden rounded-sm bg-sand" title={tr("barTip", { home: fmtAZN(c.purchase), travel: fmtAZN(c.living10y) })}>
                <div className="bg-caspian" style={{ width: `${(c.purchase / max) * 100}%` }} />
                <div className="bg-amber" style={{ width: `${(c.living10y / max) * 100}%` }} />
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-3">
                {tr("split", { home: fmtAZN(c.purchase), travel: fmtAZN(c.living10y) })} <Badge kind={priceBadge(r.prices[type])} />
              </div>
            </div>
          ))}
        </div>
        {rows.length > 0 && (
          <div className="mt-3 flex gap-4 text-[11px] text-ink-3">
            <span><span className="mr-1 inline-block h-2 w-3 bg-caspian" />{tr("legendHome")}</span>
            <span><span className="mr-1 inline-block h-2 w-3 bg-amber" />{tr("legendTravel")}</span>
            <span>{tr("legendModel")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

type Legal = { red_flags: { phrase: string; meaning: string; risk: "yüksək" | "orta" | "aşağı" }[]; checklist: { step: string; where: string; document: string }[]; verdict: string; disclaimer?: string };

const SAMPLE = "Nərimanovda 3 otaqlı mənzil satılır, 95 m², təmirli. Kupça hazırlanır, hələlik müqavilə ilə satılır. İpotekaya yararsızdır, qiymət razılaşma yolu ilə.";

function LegalCheck() {
  const [text, setText] = useState("");
  const [res, setRes] = useState<Legal | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tr = useTranslations("tools");
  const tl = useTranslations("advisor");
  const locale = useLocale();
  async function run() {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/legal-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, locale }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setRes(j.result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr("error"));
    } finally {
      setBusy(false);
    }
  }
  const riskColor = { yüksək: "text-pomegranate border-pomegranate/40", orta: "text-amber border-amber/40", aşağı: "text-green border-green/40" };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <p className="text-sm text-ink-2">{tr("legalIntro")}</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={tr("legalPh")} aria-label={tr("legalAria")} className="mt-2 w-full rounded-lg border border-sand-3 bg-sand p-3 text-sm outline-none focus:border-caspian" />
        <div className="mt-2 flex gap-2">
          <button onClick={run} disabled={busy} className="h-10 rounded-lg bg-caspian px-4 text-sm font-bold text-sand-2 disabled:opacity-60">{busy ? tr("checking") : tr("check")}</button>
          <button onClick={() => setText(SAMPLE)} className="h-10 rounded-lg px-3 text-sm font-semibold text-ink-2 hover:text-caspian">{tr("sample")}</button>
        </div>
        {err && <p className="mt-2 text-sm text-pomegranate">{err}</p>}
        {text === SAMPLE && tr("sampleNote") && <p className="mt-2 text-[11px] text-ink-3">{tr("sampleNote")}</p>}
        <p className="mt-3 text-[11px] text-ink-3">{tr("disclaimer")}</p>
      </div>
      <div>
        {res && (
          <div className="space-y-4">
            <p className="text-lg font-extrabold leading-snug">{res.verdict}</p>
            {res.red_flags.length > 0 && (
              <div className="space-y-2">
                {res.red_flags.map((f) => (
                  <div key={f.phrase} className={`rounded-lg border px-3 py-2 ${riskColor[f.risk]}`}>
                    <div className="text-sm font-extrabold">{tr("flag", { phrase: f.phrase, risk: tl(`level.${f.risk}`) })}</div>
                    <div className="text-xs leading-snug text-ink-2">{f.meaning}</div>
                  </div>
                ))}
              </div>
            )}
            <div>
              <div className="text-sm font-extrabold">{tr("beforeBuy")}</div>
              <ol className="mt-1.5 space-y-1.5 text-sm">
                {res.checklist.map((c, i) => (
                  <li key={i} className="grid grid-cols-[20px_1fr] gap-1">
                    <span className="num text-ink-3">{i + 1}.</span>
                    <span>
                      {c.step} <span className="text-ink-3">{tr("docLine", { where: c.where, doc: c.document })}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BizGap({ region, all }: { region: Region; all: Region[] }) {
  const gaps = businessGaps(region, all);
  const tr = useTranslations("tools");
  const tp = useTranslations("poi");
  const tpl = useTranslations("panel");
  return (
    <div>
      <p className="text-sm text-ink-2">{tr("bizIntro")}</p>
      {gaps.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {gaps.map((g) => (
            <div key={g.cat} className="rounded-xl bg-sand p-4">
              <div className="text-sm font-extrabold capitalize">{tp(g.cat as "pharmacy")}</div>
              <div className="num mt-1 text-3xl font-extrabold text-pomegranate">{fmt(g.ratio, 1)}×</div>
              <p className="mt-1 text-xs leading-snug text-ink-2">
                {tr.rich("bizLine", { per: fmt(g.perFacility), median: fmt(g.median), b: (c) => <b className="num">{c}</b> })}
              </p>
              <Badge kind="computed" className="mt-2" />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-3">{tr("bizNone")}</p>
      )}
      {region.coverage.osm !== "yüksək" && <p className="mt-3 text-xs text-amber">{tr("bizWarn", { level: tpl(`coverageLevel.${region.coverage.osm}`) })}</p>}
    </div>
  );
}
