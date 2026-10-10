"use client";
import { useEffect, useRef, useState } from "react";
import type { Candidate, Confidence, Intent } from "@/lib/decide";
import { useLocale, useTranslations } from "next-intl";
import { localizeLabel } from "@/lib/labels";
import { Badge } from "./Badge";
import CountUp from "./CountUp";
import { fmt, fmtAZN, priceBadge } from "@/lib/metrics";

export type DecideResult = {
  question: string;
  intent: Intent;
  intent_source: "ai" | "keyword";
  explain_source: "ai" | "template";
  retrieval: { mode: "hex" | "region"; pool: number; relaxed: string[]; scope: string };
  candidates: Candidate[];
  explain: { answer_summary: string; recommendations: { area_id: string; why: string; trade_off: string; fits_constraints: boolean }[]; what_to_check_next: string[]; clarifying_question: string | null };
  confidence: Confidence;
};
type Turn = { q: string; res?: DecideResult; err?: string };

export const SUGGESTION_KEYS = ["s1", "s2", "s3", "s4"] as const;
const STATUS = ["s0", "s1", "s2"] as const;

const BINA_TYPE: Record<string, string> = { menzil_yeni: "menziller/yeni-tikili", menzil_kohne: "menziller/kohne-tikili", heyet_evi: "heyet-evleri", obyekt: "obyektler", torpaq: "torpaq" };
function listingLinks(c: Candidate, intent: Intent) {
  const deal = intent.goal === "rent" ? "kiraye" : "alqi-satqi";
  const city = c.region_id.startsWith("bk-") || c.region_id === "az-baki" ? "baki" : c.region_id === "az-sumqayit" ? "sumqayit" : c.region_id === "az-gence" ? "gence" : "baki";
  const place = c.label.split(" · ")[1]?.replace(" m. ətrafı", "") ?? c.region_name;
  return {
    bina: `https://bina.az/${city}/${deal}/${BINA_TYPE[intent.property_type] ?? "menziller"}`,
    tap: `https://tap.az/elanlar/dasinmaz-emlak?keywords=${encodeURIComponent(`${c.region_name} ${place}`)}`,
  };
}

function Ring({ value, label }: { value: number; label: string }) {
  const t = useTranslations("advisor");
  const r = 22, C = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  const color = value >= 70 ? "var(--green)" : value >= 45 ? "var(--amber)" : "var(--pomegranate)";
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" role="img" aria-label={t("ringAria", { value, label })}>
      <circle cx="29" cy="29" r={r} fill="none" stroke="var(--sand-3)" strokeWidth="6" />
      <circle cx="29" cy="29" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(shown / 100) * C} ${C}`} transform="rotate(-90 29 29)" className="ring-anim" />
      <text x="29" y="33" textAnchor="middle" className="num" fontSize="15" fontWeight="800" fill="var(--ink)"><CountUp value={value} /></text>
    </svg>
  );
}

export default function Advisor({ onResult, onPick, initialQuery }: { onResult: (r: DecideResult) => void; onPick: (c: Candidate) => void; initialQuery?: string | null }) {
  const ta = useTranslations("advisor");
  const locale = useLocale();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusI, setStatusI] = useState(0);
  const end = useRef<HTMLDivElement>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!busy) return;
    setStatusI(0);
    const t = setInterval(() => setStatusI((i) => Math.min(i + 1, STATUS.length - 1)), 2600);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, busy]);
  useEffect(() => {
    if (initialQuery && !ran.current) {
      ran.current = true;
      ask(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setQ("");
    setBusy(true);
    setTurns((t) => [...t, { q: question }]);
    try {
      const r = await fetch("/api/decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, locale }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? ta("error"));
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, res: j } : x)));
      onResult(j);
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, err: e instanceof Error ? e.message : ta("error") } : x)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-sand-3 p-4">
        <div className="text-xs font-bold text-caspian">{ta("title")}</div>
        <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="mt-2 flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ta("placeholder")} aria-label={ta("inputLabel")} className="h-11 min-w-0 flex-1 rounded-lg border border-sand-3 bg-sand px-3 text-sm outline-none focus:border-caspian" />
          <button disabled={busy} className="btn-primary h-11 shrink-0 rounded-lg bg-caspian px-4 text-sm font-bold text-sand-2 disabled:opacity-60">{ta("ask")}</button>
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTION_KEYS.map((k) => ta(`suggest.${k}`)).map((s) => (
            <button key={s} onClick={() => ask(s)} disabled={busy} className="chip rounded-full border border-sand-3 px-2.5 py-1 text-[11px] text-ink-2 hover:border-caspian hover:text-caspian disabled:opacity-50">{s}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {!turns.length && (
          <div className="rounded-xl bg-sand p-4 text-sm leading-relaxed text-ink-2">
            {ta.rich("intro", { b: (c) => <b>{c}</b> })}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="fade-in space-y-3">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-caspian px-3.5 py-2 text-sm text-sand-2">{t.q}</div>
            {t.err && <p className="text-sm text-pomegranate">{t.err}</p>}
            {!t.res && !t.err && (
              <div className="space-y-2" aria-live="polite">
                <div className="text-xs font-semibold text-caspian">{ta(`status.${STATUS[statusI]}`)}</div>
                {[0, 1, 2].map((k) => <div key={k} className="skeleton h-12 rounded-lg" />)}
              </div>
            )}
            {t.res && <Answer res={t.res} onPick={onPick} onAsk={ask} />}
          </div>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}

function Answer({ res, onPick, onAsk }: { res: DecideResult; onPick: (c: Candidate) => void; onAsk: (q: string) => void }) {
  const [open, setOpen] = useState(false);
  const ta = useTranslations("advisor");
  const tt = useTranslations("terrain");
  const locale = useLocale();
  const c = res.confidence;
  const lvl = ta(`level.${c.label}`);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0 text-center">
          <Ring value={c.score} label={lvl} />
          <div className="text-[10px] font-bold text-ink-3">{ta("confLabel", { label: lvl })}</div>
        </div>
        <div className="min-w-0">
          <p className="text-[15px] leading-snug">{res.explain.answer_summary}</p>
          <div className="mt-1 text-[11px] text-ink-3">
            {ta("meta", { scope: res.retrieval.scope, pool: res.retrieval.pool, mode: res.retrieval.mode === "hex" ? "hex" : "other", relaxed: res.retrieval.relaxed.length ? ta("relaxed", { list: res.retrieval.relaxed.join(", ") }) : "", source: res.intent_source === "ai" ? "ai" : "rule" })}
          </div>
          <button onClick={() => setOpen(!open)} className="mt-1 text-[11px] font-bold text-caspian underline-offset-2 hover:underline" aria-expanded={open}>{ta("why", { score: c.score })}</button>
        </div>
      </div>
      {open && (
        <div className="rounded-lg bg-sand p-3 text-xs">
          {c.parts.map((p) => (
            <div key={p.key} className="mb-1.5 last:mb-0">
              <div className="flex justify-between font-semibold"><span>{p.label} · {p.weight}%</span><span className="num">{Math.round(p.value * p.weight)}/{p.weight}</span></div>
              <div className="mt-0.5 h-1.5 rounded bg-sand-3"><div className="h-1.5 rounded bg-caspian" style={{ width: `${p.value * 100}%` }} /></div>
              <div className="mt-0.5 text-ink-3">{p.note}</div>
            </div>
          ))}
          <div className="mt-1 text-ink-3">{ta("formula")}</div>
        </div>
      )}
      <ol className="space-y-2">
        {res.candidates.map((cand) => {
          const rec = res.explain.recommendations.find((r) => r.area_id === cand.area_id);
          const links = listingLinks(cand, res.intent);
          const pc = cand.metrics.price_confidence as string | null;
          return (
            <li key={cand.area_id} className="card-lift fade-in rounded-xl border border-sand-3 bg-sand p-3" style={{ animationDelay: `${cand.rank * 70}ms` }}>
              <button onClick={() => onPick(cand)} className="flex w-full items-start gap-2.5 text-left">
                <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-extrabold text-sand">{cand.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-extrabold">{localizeLabel(cand.label, locale)}</span>
                    <span className="num shrink-0 text-sm font-extrabold text-green">{cand.score}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1 text-[11px] text-ink-2">
                    {cand.kind === "hex" && cand.metrics.metro_walk_m != null && <span className="rounded bg-caspian/10 px-1.5 py-0.5 font-semibold text-caspian">{ta("chipMetro", { m: `${fmt(cand.metrics.metro_walk_m as number)} m` })}</span>}
                    {cand.kind === "hex" && cand.metrics.school_m != null && <span className="rounded bg-sand-3/70 px-1.5 py-0.5">{ta("chipSchool", { m: `${fmt(cand.metrics.school_m as number)} m` })}</span>}
                    {cand.kind === "hex" && <span className="rounded bg-sand-3/70 px-1.5 py-0.5">{ta("chipShops", { g: Number(cand.metrics.grocery), p: Number(cand.metrics.pharmacy) })}</span>}
                    {cand.metrics.price_m2_hex_median != null ? (
                      <span className="rounded bg-amber/15 px-1.5 py-0.5">{ta("chipHexPrice", { price: fmtAZN(cand.metrics.price_m2_hex_median as number, "m²"), n: Number(cand.metrics.price_hex_listings) })}</span>
                    ) : cand.metrics.price_m2_district_avg != null && <span className="rounded bg-sand-3/70 px-1.5 py-0.5">{ta("chipDistrictPrice", { price: fmtAZN(cand.metrics.price_m2_district_avg as number, "m²") })}</span>}
                    {cand.kind === "settlement" && <span className="rounded bg-sand-3/70 px-1.5 py-0.5">{ta("chipSettlement", { g: Number(cand.metrics.grocery), s: Number(cand.metrics.school), c: Number(cand.metrics.clinic) })}</span>}
                    {cand.kind === "settlement" && cand.metrics.rayon_terrain && <span className="rounded bg-green/10 px-1.5 py-0.5 text-green">{tt(cand.metrics.rayon_terrain as "dağlıq")} · {fmt(cand.metrics.rayon_elevation_m as number)} m</span>}
                    {cand.kind !== "hex" && cand.metrics.price_m2 != null && <span className="rounded bg-sand-3/70 px-1.5 py-0.5">{fmtAZN(cand.metrics.price_m2 as number, "m²")}</span>}
                    {pc && <Badge kind={priceBadge({ confidence: pc as "mock" } as never)} />}
                    {!cand.fits_constraints && <span className="rounded bg-pomegranate/10 px-1.5 py-0.5 font-semibold text-pomegranate">{cand.violations.join(", ")}</span>}
                  </span>
                </span>
              </button>
              {rec && (
                <div className="mt-2 pl-8 text-[13px] leading-snug">
                  <p>{rec.why}</p>
                  <p className="mt-1 text-ink-2">− {rec.trade_off}</p>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-3 pl-8 text-[11px] font-semibold">
                <a href={links.bina} target="_blank" rel="noreferrer" className="text-caspian hover:underline">{ta("listings")}</a>
                <a href={links.tap} target="_blank" rel="noreferrer" className="text-caspian hover:underline">tap.az ↗</a>
              </div>
            </li>
          );
        })}
      </ol>
      {res.explain.what_to_check_next.length > 0 && (
        <div className="text-xs text-ink-2">
          <div className="font-bold text-ink">{ta("next")}</div>
          <ul className="mt-1 list-inside list-disc space-y-0.5">{res.explain.what_to_check_next.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}
      {res.explain.clarifying_question && (
        <ClarifyBox question={res.explain.clarifying_question} onAnswer={(a) => onAsk(`${res.question}. ${a}`)} />
      )}
      <p className="text-[10px] text-ink-3">{ta("footer")}</p>
    </div>
  );
}

function ClarifyBox({ question, onAnswer }: { question: string; onAnswer: (a: string) => void }) {
  const ta = useTranslations("advisor");
  const [a, setA] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (a.trim()) onAnswer(a.trim()); }} className="rounded-lg border border-amber/50 bg-amber/10 p-3">
      <div className="text-sm font-semibold">{question}</div>
      <div className="mt-2 flex gap-2">
        <input value={a} onChange={(e) => setA(e.target.value)} placeholder={ta("clarifyPh")} aria-label={question} className="h-9 min-w-0 flex-1 rounded-md border border-sand-3 bg-sand px-2 text-sm" />
        <button className="h-9 rounded-md bg-ink px-3 text-xs font-bold text-sand">{ta("clarifyBtn")}</button>
      </div>
    </form>
  );
}
