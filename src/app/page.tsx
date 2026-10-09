import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import HeroSearch from "@/components/HeroSearch";
import ThemeToggle from "@/components/ThemeToggle";

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
  { v: "+12,4%", l: "yeni tikililər bahalaşıb (2026 II rüb, illik)", s: "Mərkəzi Bank icmalı, JAM News, 31.08.2026", u: "https://jam-news.net/salaries-rise-7-while-house-prices-climb-12-4-is-it-worth-buying-home-in-azerbaijan/" },
  { v: "+7%", l: "maaşlar artıb — mənzil qiymətləri maaşdan sürətli gedir", s: "JAM News, 31.08.2026", u: "https://jam-news.net/salaries-rise-7-while-house-prices-climb-12-4-is-it-worth-buying-home-in-azerbaijan/" },
  { v: "2,8×", l: "Bakı rayonları arasında m² qiymət fərqi (Səbail 4 132 ₼, Pirallahı 1 452 ₼)", s: "Caliber.az, 30.09.2026", u: "https://caliber.az/en/post/a-metre-at-a-premium-why-are-property-prices-rising-in-baku" },
  { v: "21%", l: "Bakı elanlarında “çıxarış yoxdur” yazılıb (100 436 elandan)", s: "bina.az elanları, okt–noy 2024 (dataset)", u: "/menbeler" },
];

export default function Landing() {
  const paths = outlinePaths();
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center gap-5 px-4 py-4">
        <span className="text-[22px] font-extrabold tracking-[-0.04em] text-caspian">Məskən</span>
        <nav className="ml-auto flex items-center gap-4 text-sm font-semibold text-ink-2">
          <Link href="/xerite" className="hover:text-caspian">Xəritə</Link>
          <Link href="/muqayise" className="hover:text-caspian">Müqayisə</Link>
          <Link href="/keyfiyyet" className="hover:text-caspian">Keyfiyyət</Link>
          <Link href="/menbeler" className="hover:text-caspian">Mənbələr</Link>
          <ThemeToggle />
        </nav>
      </header>

      <section className="relative overflow-hidden">
        <svg viewBox="0 0 480 360" className="pointer-events-none absolute right-[-2%] top-[6%] h-[88%] w-auto opacity-80 max-lg:right-[-35%] max-lg:opacity-25" aria-hidden="true">
          {paths.map((p, i) => (
            <path key={i} d={p.d} pathLength={1} className="az-draw" fill={p.fill} style={{ animationDelay: `${p.delay.toFixed(2)}s, ${(p.delay + 1.6).toFixed(2)}s` }} />
          ))}
        </svg>
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-14 md:pb-28 md:pt-24">
          <h1 className="max-w-[16ch] text-[44px] font-extrabold leading-[1.02] tracking-[-0.045em] md:text-[72px]">
            Harada yaşamalı? Rəqəmlərlə, şəxsən sənin üçün.
          </h1>
          <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-ink-2">
            Ev alan və ya biznes açan insana ərazi seçməkdə kömək edirik: istəyini bir cümlə ilə yaz — 87 ərazi və 1 737 məhəllə arasından şərtlərinə uyğun olanları göstərək, qiymətini və riskini izah edək.
          </p>
          <HeroSearch />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-extrabold tracking-tight">Ev alanın üç sualı</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            ["Hansı ərazi mənə uyğundur?", "Elan saytları mənzil göstərir, məhəllə yox. Biz metroya, məktəbə, bağçaya məsafəni, xidmətləri və havanı hər məhəllə üçün sayırıq."],
            ["Evin real qiyməti nədir?", "Rayonlar arasında m² qiyməti 2,8 dəfə fərqlənir. Elan medianları və 10 illik yol xərci ilə “ucuz amma uzaq” evin həqiqi qiymətini göstəririk."],
            ["Alışda hüquqi risk varmı?", "“Kupça hazırlanır”, “müqavilə ilə”, “etibarnamə ilə” — elan mətnini yapışdır, riskləri və yoxlanmalı sənədləri göstərək."],
          ].map(([t, d]) => (
            <div key={t} className="card-lift rounded-2xl border border-sand-3 bg-sand-2 p-5">
              <div className="text-lg font-extrabold leading-snug">{t}</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-extrabold tracking-tight">Niyə indi lazımdır</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((f) => (
            <a key={f.v} href={f.u} target={f.u.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="card-lift block rounded-2xl bg-sand-2 p-5">
              <div className="num text-4xl font-extrabold tracking-tight text-caspian">{f.v}</div>
              <div className="mt-2 text-sm leading-snug">{f.l}</div>
              <div className="mt-3 text-[11px] text-ink-3 underline decoration-sand-3 underline-offset-2">{f.s}</div>
            </a>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-extrabold tracking-tight">Necə işləyir</h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            ["Yaz", "“Nərimanovda metroya yaxın ev, büdcə 180 min” — AI istəyini strukturlaşdırır: məqsəd, büdcə, yer, şərtlər.", <path key="a" d="M6 30h36M6 20h28M6 10h20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />],
            ["Süz", "Kod 1 737 məhəllədən şərtlərə uyğun olanları seçir və sıralayır — metroya piyada məsafə, məktəb, qiymət.", <g key="b"><circle cx="12" cy="12" r="5" fill="currentColor" /><circle cx="30" cy="20" r="5" fill="currentColor" opacity=".5" /><circle cx="18" cy="32" r="5" fill="currentColor" opacity=".3" /></g>],
            ["Qərar ver", "AI hər tövsiyəni rəqəmlərlə izah edir, zəif cəhəti deyir; etibarlılıq balı məlumatın keyfiyyətindən hesablanır.", <path key="c" d="M8 22l9 9 19-21" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />],
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
          <span className="font-semibold text-ink">Məlumat mənbələri:</span>
          <span>OpenStreetMap</span><span>Dövlət Statistika Komitəsi</span><span>Open-Meteo / ERA5 / CAMS</span><span>bina.az elan medianları (2024)</span><span>Google Gemini (AI)</span>
          <span className="ml-auto flex gap-4 font-semibold">
            <Link href="/menbeler" className="text-caspian hover:underline">Mənbələr və metodologiya</Link>
            <Link href="/keyfiyyet" className="text-caspian hover:underline">Testlər və keyfiyyət</Link>
          </span>
        </div>
      </section>
    </div>
  );
}
