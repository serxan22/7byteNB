import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { alternates } from "@/i18n/meta";
import { fmt, fmtAZN, setNumberLocale } from "@/lib/metrics";
import HeroSearch from "@/components/HeroSearch";
import TopNav from "@/components/TopNav";

type Geo = { features: { properties: { id: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] };

/** Azerbaijan outlines as SVG paths (equirectangular, cos-corrected), generated at build time from our own GeoJSON. */
function outlinePaths() {
  const g = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/regions-az.geojson"), "utf8")) as Geo;
  const dens = new Map<string, number>(
    (JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/regions-az.json"), "utf8")) as { id: string; density: { v: number | null } }[]).map((r) => [r.id, r.density.v ?? 0])
  );
  const K = 100, C = Math.cos((40.3 * Math.PI) / 180);
  const pt = ([lon, lat]: number[]) => `${((lon - 44.7) * K * C).toFixed(1)},${((41.95 - lat) * K).toFixed(1)}`;
  const ring = (r: number[][]) => "M" + r.map(pt).join("L") + "Z";
  const ramp = ["#b8cdc8", "#7aa9b2", "#3d7a8c", "#0f4c5c"];
  const sorted = [...dens.values()].sort((a, b) => a - b);
  const q = (v: number) => ramp[Math.min(3, Math.floor((sorted.indexOf(v) / sorted.length) * 4))];
  return g.features.map((f, i) => {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][]);
    const xs = polys[0][0].map((p) => p[0]);
    return { d: polys.map((p) => p.map(ring).join("")).join(""), fill: q(dens.get(f.properties.id) ?? 0), delay: ((Math.min(...xs) - 44.7) / 6) * 1.6 + (i % 5) * 0.05 };
  });
}

const FACTS = [
  { v: 12.4, sign: "+", unit: "%", k: "f1", u: "https://jam-news.net/salaries-rise-7-while-house-prices-climb-12-4-is-it-worth-buying-home-in-azerbaijan/" },
  { v: 7, sign: "+", unit: "%", k: "f2", u: "https://jam-news.net/salaries-rise-7-while-house-prices-climb-12-4-is-it-worth-buying-home-in-azerbaijan/" },
  { v: 2.8, sign: "", unit: "×", k: "f3", u: "https://caliber.az/en/post/a-metre-at-a-premium-why-are-property-prices-rising-in-baku" },
  { v: 21, sign: "", unit: "%", k: "f4", u: "/menbeler" },
] as const;

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: alternates("/", locale) };
}

export default async function Landing({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);
  setNumberLocale(locale);
  const t = await getTranslations("landing");
  const paths = outlinePaths();
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-4">
        <span className="text-[22px] font-extrabold tracking-[-0.04em] text-caspian">Məskən</span>
        <div className="ml-auto min-w-0 max-w-full"><TopNav /></div>
      </header>

      <section className="hero-glow relative overflow-hidden">
        <svg viewBox="0 0 480 360" className="pointer-events-none absolute right-[-4%] top-[6%] h-[88%] w-auto opacity-80 [mask-image:linear-gradient(to_right,transparent_0%,black_42%)] max-lg:right-[-35%] max-lg:opacity-25" aria-hidden="true">
          {paths.map((p, i) => (
            <path key={i} d={p.d} pathLength={1} className="az-draw" fill={p.fill} style={{ animationDelay: `${p.delay.toFixed(2)}s, ${(p.delay + 1.6).toFixed(2)}s` }} />
          ))}
        </svg>
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-14 md:pb-28 md:pt-24">
          <h1 className="max-w-[16ch] text-[44px] font-extrabold leading-[1.02] tracking-[-0.045em] md:text-[72px]">
            {t("h1")}
          </h1>
          <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-ink-2">
            {t("lead", { regions: fmt(87), hoods: fmt(3700), villages: fmt(1284) })}
          </p>
          <HeroSearch />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-extrabold tracking-tight">{t("questionsTitle")}</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            [t("q1"), t("q1d")],
            [t("q2"), t("q2d")],
            [t("q3"), t("q3d")],
          ].map(([t, d]) => (
            <div key={t} className="card-lift rounded-2xl border border-sand-3 bg-sand-2 p-5">
              <div className="text-lg font-extrabold leading-snug">{t}</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-extrabold tracking-tight">{t("whyTitle")}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((f) => (
            <a key={f.k} href={f.u.startsWith("/") && locale === "en" ? `/en${f.u}` : f.u} target={f.u.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="card-lift block rounded-2xl bg-sand-2 p-5">
              <div className="num text-4xl font-extrabold tracking-tight text-caspian">{f.sign}{fmt(f.v, 1)}{f.unit}</div>
              <div className="mt-2 text-sm leading-snug">{t(f.k, { a: fmtAZN(4132), b: fmtAZN(1452), n: fmt(100436) })}</div>
              <div className="mt-3 text-[11px] text-ink-3 underline decoration-sand-3 underline-offset-2">{t(`${f.k}s`)}</div>
            </a>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-extrabold tracking-tight">{t("howTitle")}</h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            [t("s1"), t("s1d"), <path key="a" d="M6 30h36M6 20h28M6 10h20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />],
            [t("s2"), t("s2d", { hoods: fmt(3700) }), <g key="b"><circle cx="12" cy="12" r="5" fill="currentColor" /><circle cx="30" cy="20" r="5" fill="currentColor" opacity=".5" /><circle cx="18" cy="32" r="5" fill="currentColor" opacity=".3" /></g>],
            [t("s3"), t("s3d"), <path key="c" d="M8 22l9 9 19-21" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />],
          ].map(([t, d, icon], i) => (
            <li key={i} className="rounded-2xl border border-sand-3 p-5">
              <svg viewBox="0 0 44 44" className="h-10 w-10 text-caspian" aria-hidden="true">{icon}</svg>
              <div className="mt-3 text-lg font-extrabold">{i + 1}. {t as string}</div>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{d as string}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-sand-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-ink-2">
          <span className="font-semibold text-ink">{t("trustLabel")}</span>
          <span>OpenStreetMap</span><span>{t("trustSsc")}</span><span>Open-Meteo / ERA5 / CAMS</span><span>{t("trustListings")}</span><span>Google Gemini (AI)</span>
          <span className="ml-auto flex gap-4 font-semibold">
            <Link href="/menbeler" className="link-u text-caspian">{t("trustSources")}</Link>
            <Link href="/keyfiyyet" className="link-u text-caspian">{t("trustQuality")}</Link>
          </span>
        </div>
      </section>
    </div>
  );
}
