"use client";
import { useEffect, useState } from "react";
import type { National, Region } from "@/lib/types";
import type { Persona } from "@/lib/score";
import { useLocale, useTranslations } from "next-intl";

type FitExplain = { fit_comment: string; why: string[]; trade_offs: string[] };

export default function AIAnalyst({ region: r, national, persona, fit, overBudget }: { region: Region; national: National; persona: Persona | null; fit: number | null; overBudget: boolean }) {
  const locale = useLocale();
  const t = useTranslations("analyst");
  const tt = useTranslations("tags");
  // English profile when available; otherwise the Azerbaijani one, whole, with a note (never mixed in one paragraph)
  const ai = locale === "en" && r.ai_en ? r.ai_en : r.ai;
  const pendingEn = locale === "en" && !r.ai_en && !!r.ai;
  const [fx, setFx] = useState<FitExplain | null>(null);
  const [fxBusy, setFxBusy] = useState(false);

  useEffect(() => {
    setFx(null);
    if (!persona || fit == null) return;
    let cancel = false;
    setFxBusy(true);
    fetch("/api/fit-explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ persona, regionId: r.id, fit, overBudget, locale }) })
      .then((res) => res.json())
      .then((j) => !cancel && setFx(j.result ?? null))
      .catch(() => {})
      .finally(() => !cancel && setFxBusy(false));
    return () => {
      cancel = true;
    };
  }, [r.id, persona, fit, overBudget, locale]);

  return (
    <section className="rounded-2xl border-2 border-caspian/25 bg-sand-2 p-5 md:p-7" aria-labelledby="ai-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="ai-title" className="text-sm font-extrabold text-caspian">
          {t("title", { name: r.name })}
        </h3>
        <span className="text-[11px] text-ink-3">{t("byline")}</span>
      </div>

      {pendingEn && <p className="mt-2 rounded-lg bg-amber/10 px-3 py-1.5 text-xs font-semibold text-amber" lang="en">{t("translationSoon")}</p>}
      {ai ? (
        <div className="mt-3 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-ink md:text-[30px]">{ai.headline}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ai.tags.map((t) => (
                <div key={t.tag} className="rounded-lg border border-green/30 bg-green/5 px-2.5 py-1.5">
                  <div className="text-xs font-extrabold text-green">{tt(t.tag)}</div>
                  <div className="max-w-[260px] text-[11px] leading-snug text-ink-2">{t.reason}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-ink-2">{ai.summary}</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <div className="text-sm font-extrabold text-green">{t("strengths")}</div>
                <ul className="mt-1.5 space-y-1.5 text-sm leading-snug">
                  {ai.strengths.map((s) => (
                    <li key={s} className="border-l-2 border-green pl-2.5">{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-sm font-extrabold text-pomegranate">{t("weaknesses")}</div>
                <ul className="mt-1.5 space-y-1.5 text-sm leading-snug">
                  {ai.weaknesses.map((s) => (
                    <li key={s} className="border-l-2 border-pomegranate pl-2.5">{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {persona && (
              <div className="rounded-xl bg-green/10 p-4">
                <div className="flex items-baseline justify-between">
                  <div className="text-sm font-extrabold text-green">{t("forYou")}</div>
                  {fit != null && <div className={`num text-3xl font-extrabold ${overBudget ? "text-pomegranate" : "text-green"}`}>{fit}<span className="text-sm text-ink-3">/100</span></div>}
                </div>
                {fxBusy && <p className="mt-1 text-xs text-ink-3">{t("preparing")}</p>}
                {fx && (
                  <div className="mt-1 text-sm leading-snug">
                    <p>{fx.fit_comment}</p>
                    <ul className="mt-2 space-y-1">{fx.why.map((w) => <li key={w}>+ {w}</li>)}</ul>
                    <ul className="mt-1 space-y-1 text-ink-2">{fx.trade_offs.map((w) => <li key={w}>− {w}</li>)}</ul>
                  </div>
                )}
              </div>
            )}
            <div>
              <div className="text-sm font-extrabold">{t("bestFor")}</div>
              <ul className="mt-1 list-inside list-disc text-sm text-ink-2">{ai.best_for.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <div>
              <div className="text-sm font-extrabold">{t("watchOut")}</div>
              <ul className="mt-1 list-inside list-disc text-sm text-ink-2">{ai.watch_out.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <p className="rounded-lg bg-sand px-3 py-2 text-xs leading-snug text-ink-2">{ai.confidence_note}</p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-3">{t("noProfile")}</p>
      )}

      <p className="mt-4 text-[11px] text-ink-3">{t("footnote")}</p>
    </section>
  );
}
