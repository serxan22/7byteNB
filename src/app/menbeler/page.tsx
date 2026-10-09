import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/Badge";
import type { Badge as B } from "@/lib/types";
import { BADGE_HINT, BADGE_LABEL, PROPERTY_LABEL } from "@/lib/metrics";

export const metadata: Metadata = { title: "Mənbələr və metodologiya — Məskən" };

type Dataset = { key: string; name: string; url: string | null; badge: B; status: string; date: string | null; coverage: string; used_for: string; license?: string };
type PriceRow = { region_id: string; region_name: string; property_type: keyof typeof PROPERTY_LABEL; value: number | null; unit: string; source: string; source_url?: string; confidence: string };

const STATUS: Record<string, { t: string; c: string }> = {
  ok: { t: "işləyir", c: "text-green" },
  partial: { t: "qismən", c: "text-amber" },
  unavailable: { t: "əlçatan deyil", c: "text-pomegranate" },
  future: { t: "gələcəkdə", c: "text-ink-3" },
};

export default function Sources() {
  const src = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/sources.json"), "utf8")) as { generated_at: string; datasets: Dataset[]; prices: PriceRow[] };
  const real = src.prices.filter((p) => p.confidence !== "mock" && p.value != null);
  const demo = src.prices.filter((p) => p.confidence === "mock");
  const demoRegions = [...new Set(demo.map((p) => p.region_name))];
  const unit = (u: string) => (u === "AZN_sot" ? "₼/sot" : "₼/m²");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <Link href="/" className="text-sm font-bold text-caspian">← Xəritəyə qayıt</Link>
      <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.035em] md:text-5xl">Mənbələr və metodologiya</h1>
      <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-ink-2">
        Məskəndə göstərilən hər rəqəmin yanında mənbə nişanı var. Bu səhifə həmin mənbələri, hesablama qaydalarını və məlumatın harada zəif olduğunu açıq göstərir. Məlumat yeniləndi: {src.generated_at.slice(0, 10)}.
      </p>

      <section className="mt-8">
        <h2 className="text-xl font-extrabold">Nişanlar</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {(Object.keys(BADGE_LABEL) as B[]).map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm">
              <Badge kind={b} className="mt-0.5" />
              <span className="text-ink-2">{BADGE_HINT[b]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-extrabold">Məlumat dəstləri</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-sand-3 bg-sand-2">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-sand-3 text-xs text-ink-3">
              <tr>
                <th className="px-3 py-2 font-semibold">Mənbə</th>
                <th className="px-3 py-2 font-semibold">Nə üçün</th>
                <th className="px-3 py-2 font-semibold">Əhatə</th>
                <th className="px-3 py-2 font-semibold">Tarix</th>
                <th className="px-3 py-2 font-semibold">Vəziyyət</th>
              </tr>
            </thead>
            <tbody>
              {src.datasets.map((d) => (
                <tr key={d.key} className="border-b border-sand-3/60 align-top last:border-0">
                  <td className="px-3 py-2.5">
                    <div className="font-bold">{d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="underline decoration-sand-3 underline-offset-2 hover:text-caspian">{d.name}</a> : d.name}</div>
                    <Badge kind={d.badge} className="mt-1" />
                    {d.license && <div className="mt-1 text-[11px] text-ink-3">{d.license}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">{d.used_for}</td>
                  <td className="px-3 py-2.5 text-ink-2">{d.coverage}</td>
                  <td className="num whitespace-nowrap px-3 py-2.5 text-ink-2">{d.date ?? "—"}</td>
                  <td className={`whitespace-nowrap px-3 py-2.5 font-semibold ${STATUS[d.status]?.c ?? ""}`}>{STATUS[d.status]?.t ?? d.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-extrabold">Qiymətlər: hansı real, hansı demo</h2>
        <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-ink-2">
          Azərbaycanda rayonlar üzrə açıq, rəsmi mənzil qiyməti statistikası yoxdur. Biz yalnız dərc olunmuş rəqəmləri götürdük (elan saytları scraping edilmir) — cəmi <b>{real.length}</b> dəyər. Qalan <b>{demo.length}</b> xana demo dəyərdir: real rəqəmlərlə uyğunlaşdırılıb (mərkəz &gt; ətraf, yeni &gt; köhnə, regionlar &lt; Bakı), amma bazar qiyməti deyil və xəritədə “Demo” nişanı ilə göstərilir. Dəyərlər <code className="rounded bg-sand-3/60 px-1">data/manual/prices.csv</code> faylından gəlir — real mənbə əlavə edildikdə kod dəyişmədən əvəz olunur.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-sand-3 bg-sand-2">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-sand-3 text-xs text-ink-3">
              <tr>
                <th className="px-3 py-2 font-semibold">Ərazi</th>
                <th className="px-3 py-2 font-semibold">Növ</th>
                <th className="px-3 py-2 text-right font-semibold">Dəyər</th>
                <th className="px-3 py-2 font-semibold">Mənbə</th>
              </tr>
            </thead>
            <tbody>
              {real.map((p) => (
                <tr key={`${p.region_id}-${p.property_type}`} className="border-b border-sand-3/60 last:border-0">
                  <td className="px-3 py-2 font-semibold">{p.region_name}</td>
                  <td className="px-3 py-2 text-ink-2">{PROPERTY_LABEL[p.property_type]}</td>
                  <td className="num px-3 py-2 text-right font-bold">{p.value?.toLocaleString("az-AZ").replace(/,/g, " ")} {unit(p.unit)}</td>
                  <td className="px-3 py-2 text-ink-2">
                    <Badge kind={p.confidence === "official" ? "official" : "press"} className="mr-1.5" />
                    {p.source_url ? <a href={p.source_url} target="_blank" rel="noreferrer" className="underline">{p.source}</a> : p.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="mt-3 rounded-xl border border-sand-3 bg-sand-2 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold">Demo dəyərlər ({demo.length}) — {demoRegions.length} ərazi</summary>
          <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {demo.map((p) => (
              <div key={`${p.region_id}-${p.property_type}`} className="flex justify-between gap-2 border-b border-sand-3/50 py-1 text-xs">
                <span>{p.region_name} · {PROPERTY_LABEL[p.property_type]}</span>
                <span className="num text-ink-2">{p.value?.toLocaleString("az-AZ").replace(/,/g, " ")} {unit(p.unit)} <Badge kind="mock" /></span>
              </div>
            ))}
          </div>
        </details>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-extrabold">Tətbiq edilə bilərlik: məlumat və xərc</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-sand-3 bg-sand-2">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-sand-3 text-xs text-ink-3"><tr><th className="px-3 py-2">Məlumat</th><th className="px-3 py-2">İndi</th><th className="px-3 py-2">İstehsal üçün lazımdır</th></tr></thead>
            <tbody>
              {[
                ["Sərhədlər, POI, metro, dayanacaq, yollar", "real (OSM)", "aylıq avtomatik yeniləmə + data-sanity testləri"],
                ["Əhali, sıxlıq", "rəsmi (DSK, 01.01.2026)", "illik yeniləmə"],
                ["Qiymətlər", "54 elan medianı + 7 dərc olunmuş rəqəm; 40 demo", "elan portalı / bank / Qiymətləndiricilər Palatası ilə tərəfdaşlıq (API)"],
                ["Metro siyahısı", "27 işləyən stansiya ilə yoxlanılıb", "rəsmi GTFS / Metropoliten API"],
                ["Hüquqi mətnlər", "yoxdur — AI maddə nömrəsi çəkmir", "hüquqşünas tərəfindən yoxlanmış korpus"],
                ["Tıxac / real səyahət vaxtı", "yoxdur (düz xətt × 1.4)", "Waze for Cities / Yandex tərəfdaşlığı"],
              ].map((r) => <tr key={r[0]} className="border-b border-sand-3/60 last:border-0">{r.map((c, i) => <td key={i} className={`px-3 py-2 ${i ? "text-ink-2" : "font-semibold"}`}>{c}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-[75ch] text-sm leading-relaxed text-ink-2">
          Xərc: bir AI çağırışı orta hesabla ~2 000 giriş + ~400 çıxış token istifadə edir (ölçülüb). Bir sessiya (~4 çağırış) gemini-3.7-flash ilə ≈ $0.006, ehtiyatlı qiymətlə ≈ $0.03; 1000 istifadəçi ≈ $6–26. Pulsuz Gemini limiti demo üçün kifayətdir, keş təkrar sualları pulsuz edir; hostinq pulsuzdur (statik məlumat). Ətraflı: <Link href="/keyfiyyet" className="underline">Keyfiyyət və testlər</Link>. Növbəti addım: bir rieltorla 4 həftəlik pilot, qiymət məlumatı tərəfdaşlığı, aylıq OSM yeniləməsi.
        </p>
      </section>

      <section className="mt-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-extrabold">Metodologiya</h2>
          <ul className="mt-3 space-y-3 text-sm leading-relaxed text-ink-2">
            <li><b className="text-ink">Məhəllələr.</b> H3 (rezolyusiya 8, ~0.7 km²) altıbucaqlar: Bakı, Sumqayıt, Gəncə — 1 737 məhəllə; ən yaxın metro (27 işləyən stansiya ilə yoxlanılıb), dayanacaq, məktəb, bağça, park məsafəsi; ad OSM yaşayış məntəqəsindən. Qiymət məhəllədə ≥5 elan varsa median, yoxdursa rayon ortası.</li>
            <li><b className="text-ink">Qərar mühərriki.</b> AI sorğunu strukturlaşdırır və izah edir; uyğun əraziləri kod süzür və sıralayır; etibarlılıq balını kod hesablayır (əhatə 40%, sorğunun tamlığı 25%, 1-ci və 2-ci arasında fərq 20%, şərtlərə uyğunluq 15%).</li>
            <li><b className="text-ink">Ərazilər.</b> OSM inzibati sərhədləri: 75 rayon/şəhər və Bakının 12 rayonu. Dəniz sahəsi Xəzər sahil xətti ilə kəsilib (adalar saxlanılıb). Əhali və sıxlıq — DSK, 01.01.2026.</li>
            <li><b className="text-ink">Xidmətlər.</b> OSM obyektləri (aptek, ərzaq, məktəb, bağça, xəstəxana, poliklinika, bank, kafe, idman, park və s.) poliqonun içinə düşməsinə görə sayılır və 10 min sakinə bölünür.</li>
            <li><b className="text-ink">Nəqliyyat.</b> Metro və dəmiryol stansiyaları (ada görə unikal), avtobus dayanacaqları, OSM-də xəritələnən avtobus/mikroavtobus marşrutları; Bakı rayonları üçün mərkəzdən ən yaxın metroya düz xətt məsafəsi.</li>
            <li><b className="text-ink">Yollar.</b> Əsas yollar, küçələr və kənd yolları; örtük OSM “surface” teqindən: asfalt/beton, torpaq/çınqıl, məlum deyil. Xəritədə “asfalt %” örtüyü məlum yollar arasında hesablanır.</li>
            <li><b className="text-ink">Təbiət.</b> Torpaq örtüyü hər ərazidə 30×30–36×36 nöqtəlik şəbəkə ilə OSM poliqonlarından ölçülür (təxmini). Hündürlük: Open-Meteo, 5×5 şəbəkə; relyef: düzənlik (orta &lt;200 m, std &lt;50), dağlıq (orta &gt;1000 m və ya std &gt;250), qalanları dağətəyi. İqlim — ERA5 (2025), PM2.5 — CAMS modeli.</li>
            <li><b className="text-ink">İndekslər (0–100).</b> Hər göstərici eyni səviyyədəki ərazilər arasında faiz dərəcəsinə çevrilir, indeks onların ortasıdır: rahatlıq, nəqliyyat, təhsil, səhiyyə, təbiət, yol infrastrukturu, əlçatanlıq (qiymət tərsinə).</li>
            <li><b className="text-ink">Uyğunluq.</b> Persona cümləsindən AI çəkilər çıxarır; bal = Σ(çəki × indeks) / Σ çəki. Ev büdcəni keçirsə, bal ×0.3 və “büdcədən baha”.</li>
            <li><b className="text-ink">Həqiqi qiymət (10 il).</b> Ev qiyməti + 120 ay × (aylıq yol xərci + yolda keçən saat × saatın dəyəri). Məsafə = düz xətt × 1.4; sürətlər: metro 30, avtobus 15, avtomobil 25 (Bakı) / 60 km/saat. Təxmini model.</li>
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-extrabold">AI necə işləyir</h2>
          <ul className="mt-3 space-y-3 text-sm leading-relaxed text-ink-2">
            <li>AI Google Gemini (flash) üzərində işləyir. Model yalnız ərazinin JSON göstəricilərini görür və yalnız oradakı rəqəmləri işlədə bilər; cavab JSON sxemi ilə yoxlanılır (zod).</li>
            <li>Ərazi profilləri əvvəlcədən hazırlanıb və keşlənib; persona, sual-cavab, müqayisə və hüquqi yoxlama canlı çağırılır və nəticə keşlənir.</li>
            <li>AI əlçatan olmadıqda (limit, şəbəkə) sayt qayda əsaslı cavaba keçir və bunu mətndə açıq yazır.</li>
            <li>Hüquqi yoxlamada məlum risk ifadələri (çıxarışsız, kupçasız, etibarnamə ilə və s.) həm də deterministik qayda ilə tapılır, AI onları buraxa bilməz. Qanun maddəsi yalnız mətni bazadadırsa göstərilir.</li>
          </ul>
          <h2 className="mt-8 text-xl font-extrabold">Məhdudiyyətlər</h2>
          <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-ink-2">
            <li>Qiymətlər: 17 ərazidə bina.az elan medianı (2024, istifadəçinin verdiyi dataset; scraping etmirik, yalnız aqreqat saxlanılır), 7 dərc olunmuş rəqəm, qalanları demo. Rayonların çoxunda qiymət yoxdur.</li>
            <li>OSM regionlarda natamamdır: az obyekt “yoxdur” yox, “xəritələnməyib” deməkdir. Hər ərazidə əhatə səviyyəsi göstərilir.</li>
            <li>Marşrut sayı yalnız OSM-də xəritələnən xətləri əks etdirir; regionlarda bu rəqəm çox aşağıdır.</li>
            <li>PM2.5 ölçmə deyil, model təxminidir; iqlim ərazinin mərkəz nöqtəsi üçündür.</li>
            <li>Qarabağ və Şərqi Zəngəzurda əhali və infrastruktur sürətlə dəyişir; məlumat geridə qala bilər.</li>
            <li>Tıxac və real səyahət vaxtı yoxdur — Yandex/Waze ilə yalnız rəsmi tərəfdaşlıq yolu ilə (scraping edilmir).</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
