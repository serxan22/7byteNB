import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { alternates } from "@/i18n/meta";
import type { AppLocale } from "@/i18n/routing";
import { Badge } from "@/components/Badge";
import type { Badge as B, PropertyType } from "@/lib/types";
import { fmtAZN, setNumberLocale } from "@/lib/metrics";
import { localizeSource } from "@/lib/labels";

type DatasetText = { name: string; coverage: string; used_for: string; date?: string };
type Dataset = DatasetText & { key: string; url: string | null; badge: B; status: string; date: string | null; license?: string; en?: DatasetText };
type PriceRow = { region_id: string; region_name: string; property_type: PropertyType; value: number | null; unit: string; source: string; source_url?: string; confidence: string };

const BADGES: B[] = ["osm", "official", "computed", "sample", "mock", "model", "press"];
const STATUS_C: Record<string, string> = { ok: "text-green", partial: "text-amber", unavailable: "text-pomegranate", future: "text-ink-3" };
const FEAS = ["r1", "r2", "r3", "r4", "r5", "r6"] as const;
const METHOD = ["mahalle", "engine", "areas", "services", "transport", "roads", "nature", "indices", "fit", "trueCost"] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: AppLocale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "sources" });
  return { title: t("metaTitle"), description: t("metaDesc"), alternates: alternates("/menbeler", locale) };
}

export default async function Sources({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  setNumberLocale(locale);
  const t = await getTranslations("sources");
  const tb = await getTranslations("badges");
  const tp = await getTranslations("property");
  const en = locale === "en";
  const src = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/sources.json"), "utf8")) as { generated_at: string; datasets: Dataset[]; prices: PriceRow[] };
  const real = src.prices.filter((p) => p.confidence !== "mock" && p.value != null);
  const demo = src.prices.filter((p) => p.confidence === "mock");
  const demoRegions = [...new Set(demo.map((p) => p.region_name))];
  const price = (p: PriceRow) => fmtAZN(p.value, p.unit === "AZN_sot" ? "sot" : "m²");
  const tx = (d: Dataset) => (en && d.en ? { ...d, ...d.en, date: d.en.date ?? d.date } : d);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:py-12">
      <Link href="/xerite" className="text-sm font-bold text-caspian">{t("back")}</Link>
      <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.035em] md:text-5xl">{t("h1")}</h1>
      <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-ink-2">{t("intro", { date: new Date(src.generated_at).toLocaleDateString(en ? "en-GB" : "az-AZ", { day: "numeric", month: "long", year: "numeric" }) })}</p>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">{t("badgesH")}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {BADGES.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm">
              <Badge kind={b} className="mt-0.5" />
              <span className="text-ink-2">{tb(`hint.${b}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-extrabold">{t("datasetsH")}</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-sand-3 bg-sand-2">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-sand-3 text-xs text-ink-3">
              <tr>
                <th className="px-3 py-2 font-semibold">{t("col.source")}</th>
                <th className="px-3 py-2 font-semibold">{t("col.usedFor")}</th>
                <th className="px-3 py-2 font-semibold">{t("col.coverage")}</th>
                <th className="px-3 py-2 font-semibold">{t("col.date")}</th>
                <th className="px-3 py-2 font-semibold">{t("col.status")}</th>
              </tr>
            </thead>
            <tbody>
              {src.datasets.map(tx).map((d) => (
                <tr key={d.key} className="border-b border-sand-3/60 align-top last:border-0">
                  <td className="px-3 py-2.5">
                    <div className="font-bold">{d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="underline decoration-sand-3 underline-offset-2 hover:text-caspian">{d.name}</a> : d.name}</div>
                    <Badge kind={d.badge} className="mt-1" />
                    {d.license && <div className="mt-1 text-[11px] text-ink-3">{d.license}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">{d.used_for}</td>
                  <td className="px-3 py-2.5 text-ink-2">{d.coverage}</td>
                  <td className="num whitespace-nowrap px-3 py-2.5 text-ink-2">{d.date ?? "—"}</td>
                  <td className={`whitespace-nowrap px-3 py-2.5 font-semibold ${STATUS_C[d.status] ?? ""}`}>{STATUS_C[d.status] ? t(`status.${d.status as "ok"}`) : d.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-extrabold">{t("pricesH")}</h2>
        <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-ink-2">
          {t.rich("pricesBody", { real: real.length, demo: demo.length, b: (c) => <b>{c}</b>, code: (c) => <code className="rounded bg-sand-3/60 px-1">{c}</code> })}
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-sand-3 bg-sand-2">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-sand-3 text-xs text-ink-3">
              <tr>
                <th className="px-3 py-2 font-semibold">{t("col.area")}</th>
                <th className="px-3 py-2 font-semibold">{t("col.type")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("col.value")}</th>
                <th className="px-3 py-2 font-semibold">{t("col.source")}</th>
              </tr>
            </thead>
            <tbody>
              {real.map((p) => (
                <tr key={`${p.region_id}-${p.property_type}`} className="border-b border-sand-3/60 last:border-0">
                  <td className="px-3 py-2 font-semibold">{p.region_name}</td>
                  <td className="px-3 py-2 text-ink-2">{tp(p.property_type)}</td>
                  <td className="num whitespace-nowrap px-3 py-2 text-right font-bold">{price(p)}</td>
                  <td className="px-3 py-2 text-ink-2">
                    <Badge kind={p.confidence === "official" ? "official" : "press"} className="mr-1.5" />
                    {p.source_url ? <a href={p.source_url} target="_blank" rel="noreferrer" className="underline">{localizeSource(p.source, locale)}</a> : localizeSource(p.source, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="mt-3 rounded-xl border border-sand-3 bg-sand-2 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold">{t("demoSummary", { n: demo.length, areas: demoRegions.length })}</summary>
          <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {demo.map((p) => (
              <div key={`${p.region_id}-${p.property_type}`} className="flex justify-between gap-2 border-b border-sand-3/50 py-1 text-xs">
                <span>{p.region_name} · {tp(p.property_type)}</span>
                <span className="num text-ink-2">{price(p)} <Badge kind="mock" /></span>
              </div>
            ))}
          </div>
        </details>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-extrabold">{t("feasH")}</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-sand-3 bg-sand-2">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-sand-3 text-xs text-ink-3"><tr><th className="px-3 py-2">{t("feas.data")}</th><th className="px-3 py-2">{t("feas.now")}</th><th className="px-3 py-2">{t("feas.prod")}</th></tr></thead>
            <tbody>
              {FEAS.map((k) => t(`feas.${k}`).split("|")).map((r) => <tr key={r[0]} className="border-b border-sand-3/60 last:border-0">{r.map((c, i) => <td key={i} className={`px-3 py-2 ${i ? "text-ink-2" : "font-semibold"}`}>{c}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-[75ch] text-sm leading-relaxed text-ink-2">
          {t.rich("cost", { link: (c) => <Link href="/keyfiyyet" className="underline">{c}</Link> })}
        </p>
      </section>

      <section className="mt-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-extrabold">{t("methodH")}</h2>
          <ul className="mt-3 space-y-3 text-sm leading-relaxed text-ink-2">
            {METHOD.map((k) => <li key={k}>{t.rich(`m.${k}`, { b: (c) => <b className="text-ink">{c}</b> })}</li>)}
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-extrabold">{t("aiH")}</h2>
          <ul className="mt-3 space-y-3 text-sm leading-relaxed text-ink-2">
            {(["1", "2", "3", "4"] as const).map((k) => <li key={k}>{t(`ai.${k}`)}</li>)}
          </ul>
          <h2 className="mt-8 text-xl font-extrabold">{t("limitsH")}</h2>
          <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-ink-2">
            {(["1", "2", "3", "4", "5", "6"] as const).map((k) => <li key={k}>{t(`l.${k}`)}</li>)}
          </ul>
        </div>
      </section>
    </div>
  );
}
