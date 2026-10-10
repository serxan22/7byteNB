import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { alternates } from "@/i18n/meta";
import type { AppLocale } from "@/i18n/routing";
import { fmt, setNumberLocale } from "@/lib/metrics";

export async function generateMetadata({ params }: { params: Promise<{ locale: AppLocale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "quality" });
  return { title: t("metaTitle"), description: t("metaDesc"), alternates: alternates("/keyfiyyet", locale) };
}

type Acc = Record<string, number>;
type Intent = { n: number; ai_answered: number; accuracy: { ai: Acc; baseline: Acc }; rows: { q: string; ai: Record<string, boolean> | null; baseline: Record<string, boolean> }[] };
type Grounding = { n_texts: number; numbers: number; ungrounded: number; grounded_pct: number; rows: { id: string; numbers: number; ungrounded: number; examples: number[] }[] };
type Failure = { title: string; input: string; wrong: string; cause: string; mitigation: string };
type Evals = {
  generated_at: string;
  intent: Intent | null;
  intent_en?: Intent | null;
  legal: { n: number; ai: { precision: number; recall: number; tp: number; fp: number; fn: number; n: number }; baseline: { precision: number; recall: number; tp: number; fp: number; fn: number }; rows: { t: string; risky: boolean; ai: boolean | null; baseline: boolean }[] } | null;
  grounding: Grounding | null;
  grounding_en?: Grounding | null;
  retrieval: { n: number; passed: number; pass_rate: number; rows: { name: string; name_en?: string; returned: number; satisfying: number; pass: boolean; sample: string[] }[] } | null;
  sanity: { passed: number; total: number; checks: { name: string; name_en?: string | null; pass: boolean; detail: string; detail_en?: string; hard: boolean }[] } | null;
  failures: (Failure & { en?: Failure })[];
  cost: { models?: { primary: string | null; fallbacks: string[] }; avg_tokens_in: number | null; avg_tokens_out: number | null; measured_calls: number; calls_per_session: number; per_session_usd: { assumed: number | null; conservative: number | null }; per_1000_users_usd: { assumed: number | null; conservative: number | null }; prices: Record<string, { model: string; model_en?: string; in: number; out: number; source: string; source_en?: string }>; notes: string; notes_en?: string };
};

const FIELDS = ["goal", "property_type", "locations", "constraints", "budget"] as const;

function Bars({ a, b, la, lb }: { a: number; b: number; la: string; lb: string }) {
  return (
    <div className="space-y-1">
      {[[la, a, "bg-caspian"], [lb, b, "bg-ink-3"]].map(([l, v, c]) => (
        <div key={l as string} className="grid grid-cols-[130px_1fr_44px] items-center gap-2 text-xs">
          <span className="text-ink-2">{l}</span>
          <div className="h-3 rounded bg-sand-3/60"><div className={`h-3 rounded ${c}`} style={{ width: `${v}%` }} /></div>
          <span className="num text-right font-bold">{fmt(v as number, 1)}%</span>
        </div>
      ))}
    </div>
  );
}

export default async function Quality({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  setNumberLocale(locale);
  const t = await getTranslations("quality");
  const en = locale === "en";
  const pct = (v: number) => `${fmt(v, 1)}%`;
  const ai = t("aiLabel"), rule = t("ruleLabel");
  const e = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/evals.json"), "utf8")) as Evals;
  const usd = (v: number | null) => (v == null ? "—" : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <Link href="/xerite" className="text-sm font-bold text-caspian">{t("back")}</Link>
      <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.035em] md:text-5xl">{t("h1")}</h1>
      <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-ink-2">
        {t("intro", { date: new Date(e.generated_at).toLocaleString(en ? "en-GB" : "az-AZ", { timeZone: "Asia/Baku", dateStyle: "medium", timeStyle: "short" }) })}
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-4">
        {[
          [t("kpi.intent"), e.intent ? pct(e.intent.accuracy.ai.locations) : "—", e.intent ? t("rule", { v: pct(e.intent.accuracy.baseline.locations) }) : t("pending")],
          [t("kpi.legal"), e.legal ? pct(e.legal.ai.recall) : "—", e.legal ? t("rule", { v: pct(e.legal.baseline.recall) }) : t("pending")],
          [t("kpi.grounding"), e.grounding ? pct(e.grounding.grounded_pct) : "—", e.grounding ? t("numbersChecked", { n: fmt(e.grounding.numbers) }) : ""],
          [t("kpi.retrieval"), e.retrieval ? pct(e.retrieval.pass_rate) : "—", e.retrieval ? t("queriesPassed", { passed: e.retrieval.passed, n: e.retrieval.n }) : ""],
        ].map(([l, v, s]) => (
          <div key={l} className="rounded-xl border border-sand-3 bg-sand-2 p-4">
            <div className="text-xs font-semibold text-ink-3">{l}</div>
            <div className="num mt-1 text-3xl font-extrabold">{v}</div>
            <div className="text-[11px] text-ink-3">{s}</div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm text-ink-3">{t("sampleNote")}</p>

      <section className="mt-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-extrabold">{t("intentH")}</h2>
          <p className="mt-1 text-sm text-ink-2">{e.intent ? t("intentBody", { n: e.intent.n }) : t("notDone")}</p>
          {e.intent && (
            <div className="mt-3 space-y-3">
              {FIELDS.map((f) => (
                <div key={f}>
                  <div className="mb-1 text-xs font-bold">{t(`field.${f}`)}</div>
                  <Bars a={e.intent!.accuracy.ai[f]} b={e.intent!.accuracy.baseline[f]} la={ai} lb={rule} />
                </div>
              ))}
            </div>
          )}
          {e.intent_en && (
            <div className="mt-5">
              <div className="text-sm font-extrabold">{t("intentEnH")}</div>
              <p className="mt-1 text-sm text-ink-2">{t("intentEnBody", { n: e.intent_en.n })}</p>
              <div className="mt-3 space-y-3">
                {FIELDS.map((f) => (
                  <div key={f}>
                    <div className="mb-1 text-xs font-bold">{t(`field.${f}`)}</div>
                    <Bars a={e.intent_en!.accuracy.ai[f]} b={e.intent_en!.accuracy.baseline[f]} la={ai} lb={rule} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          <h2 className="text-xl font-extrabold">{t("legalH")}</h2>
          <p className="mt-1 text-sm text-ink-2">{e.legal ? t("legalBody", { n: e.legal.n }) : t("notDone")}</p>
          {e.legal && (
            <div className="mt-3 space-y-3">
              <div><div className="mb-1 text-xs font-bold">{t("recall")}</div><Bars a={e.legal.ai.recall} b={e.legal.baseline.recall} la={ai} lb={rule} /></div>
              <div><div className="mb-1 text-xs font-bold">{t("precision")}</div><Bars a={e.legal.ai.precision} b={e.legal.baseline.precision} la={ai} lb={rule} /></div>
              <p className="text-xs text-ink-3">{t("combined")}</p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-extrabold">{t("groundH")}</h2>
          {e.grounding && (
            <>
              <p className="mt-1 text-sm text-ink-2">{t("groundBody", { n: e.grounding.n_texts })}</p>
              <div className="mt-3"><Bars a={e.grounding.grounded_pct} b={100} la={t("foundInJson")} lb={t("target")} /></div>
              <p className="mt-2 text-xs text-ink-3">{t("notFound", { n: e.grounding.ungrounded, ex: e.grounding.rows.filter((r) => r.ungrounded).slice(0, 4).map((r) => `${r.id} → ${r.examples.join(", ")}`).join("; ") || t("none") })}</p>
              {e.grounding_en && <p className="mt-2 text-xs text-ink-2">{t("groundEn", { n: e.grounding_en.n_texts, numbers: fmt(e.grounding_en.numbers), pct: fmt(e.grounding_en.grounded_pct, 1) })}</p>}
            </>
          )}
        </div>
        <div>
          <h2 className="text-xl font-extrabold">{t("retrH")}</h2>
          {e.retrieval && (
            <table className="mt-2 w-full text-xs">
              <thead className="text-ink-3">
                <tr className="border-b border-sand-3">
                  <th className="py-1.5 pr-2 text-left font-semibold">{t("retrQ")}</th>
                  <th className="px-2 py-1.5 text-right font-semibold">{t("retrN")}</th>
                  <th className="py-1.5 pl-2 text-right font-semibold">{t("result")}</th>
                </tr>
              </thead>
              <tbody>
                {e.retrieval.rows.map((r) => (
                  <tr key={r.name} className="border-b border-sand-3/60 last:border-0">
                    <td className="py-1.5 pr-2">{en && r.name_en ? r.name_en : r.name}</td>
                    <td className="num px-2 py-1.5 text-right text-ink-2">{r.satisfying} / {r.returned}</td>
                    <td className={`py-1.5 pl-2 text-right font-bold ${r.pass ? "text-green" : "text-pomegranate"}`}>{r.pass ? t("passed") : "✗"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-extrabold">{t("sanityH")}</h2>
        {e.sanity && (
          <div className="mt-3 overflow-x-auto rounded-xl border border-sand-3 bg-sand-2">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="border-b border-sand-3 text-xs text-ink-3">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">{t("result")}</th>
                  <th className="px-3 py-2 text-left font-semibold">{t("check")}</th>
                  <th className="px-3 py-2 text-left font-semibold">{t("detail")}</th>
                </tr>
              </thead>
              <tbody>
                {e.sanity.checks.map((c) => (
                  <tr key={c.name} className="border-b border-sand-3/60 last:border-0">
                    <td className={`px-3 py-2 font-bold ${c.pass ? "text-green" : c.hard ? "text-pomegranate" : "text-amber"}`}>{c.pass ? "✓" : c.hard ? "✗" : "!"}</td>
                    <td className="px-3 py-2">{en && c.name_en ? c.name_en : c.name}</td>
                    <td className="px-3 py-2 text-xs text-ink-2">{en && c.detail_en ? c.detail_en : c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-extrabold">{t("failH")}</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {e.failures.map((x) => (en && x.en ? x.en : x)).map((f) => (
            <div key={f.title} className="rounded-xl border border-sand-3 bg-sand-2 p-4 text-sm">
              <div className="font-extrabold">{f.title}</div>
              <dl className="mt-2 space-y-1.5 text-[13px] leading-snug">
                <div><dt className="inline font-semibold text-ink-3">{t("f.input")}</dt><dd className="inline">{f.input}</dd></div>
                <div><dt className="inline font-semibold text-pomegranate">{t("f.wrong")}</dt><dd className="inline">{f.wrong}</dd></div>
                <div><dt className="inline font-semibold text-ink-3">{t("f.cause")}</dt><dd className="inline">{f.cause}</dd></div>
                <div><dt className="inline font-semibold text-green">{t("f.fix")}</dt><dd className="inline">{f.mitigation}</dd></div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-extrabold">{t("cmpH")}</h2>
          <p className="mt-1 text-sm text-ink-2">{t("cmpBody")}</p>
          <table className="mt-3 w-full text-sm">
            <thead className="text-xs text-ink-3"><tr><th className="py-1 text-left">{t("participant")}</th><th className="text-right">{t("manualMin")}</th><th className="text-right">{t("meskanMin")}</th></tr></thead>
            <tbody>
              {[1, 2, 3].map((i) => (
                <tr key={i} className="border-t border-sand-3/60"><td className="py-1.5">{t("participantN", { n: i })}</td><td className="text-right text-ink-3">{t("measuring")}</td><td className="text-right text-ink-3">{t("measuring")}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-3">{t("cmpNote")}</p>
        </div>
        <div>
          <h2 className="text-xl font-extrabold">{t("costH")}</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
            <li>{t.rich("cost.model", { primary: e.cost.models?.primary ?? "—", fallbacks: e.cost.models?.fallbacks.join(", ") || "—", b: (c: React.ReactNode) => <b className="num text-ink">{c}</b> })}</li>
            <li>{t.rich("cost.avg", { in: e.cost.avg_tokens_in != null ? fmt(e.cost.avg_tokens_in) : "—", out: e.cost.avg_tokens_out != null ? fmt(e.cost.avg_tokens_out) : "—", n: e.cost.measured_calls, b: (c: React.ReactNode) => <b className="num text-ink">{c}</b> })}</li>
            <li>{t.rich("cost.session", { calls: e.cost.calls_per_session, a: usd(e.cost.per_session_usd.assumed), c: usd(e.cost.per_session_usd.conservative), model: e.cost.models?.primary ?? t("cost.primary"), b: (c: React.ReactNode) => <b className="num text-ink">{c}</b> })}</li>
            <li>{t.rich("cost.users", { a: usd(e.cost.per_1000_users_usd.assumed), c: usd(e.cost.per_1000_users_usd.conservative), b: (c: React.ReactNode) => <b className="num text-ink">{c}</b> })}</li>
            <li className="text-xs text-ink-3">{t("cost.sources", { list: Object.values(e.cost.prices).map((p) => `${en && p.model_en ? p.model_en : p.model}: $${p.in}/$${p.out} per 1M (${en && p.source_en ? p.source_en : p.source})`).join("; "), notes: (en && e.cost.notes_en) || e.cost.notes })}</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
