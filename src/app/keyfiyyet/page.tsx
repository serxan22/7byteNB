import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Keyfiyyət və testlər — Məskən" };

type Acc = Record<string, number>;
type Evals = {
  generated_at: string;
  intent: { n: number; ai_answered: number; accuracy: { ai: Acc; baseline: Acc }; rows: { q: string; ai: Record<string, boolean> | null; baseline: Record<string, boolean> }[] } | null;
  legal: { n: number; ai: { precision: number; recall: number; tp: number; fp: number; fn: number; n: number }; baseline: { precision: number; recall: number; tp: number; fp: number; fn: number }; rows: { t: string; risky: boolean; ai: boolean | null; baseline: boolean }[] } | null;
  grounding: { n_texts: number; numbers: number; ungrounded: number; grounded_pct: number; rows: { id: string; numbers: number; ungrounded: number; examples: number[] }[] } | null;
  retrieval: { n: number; passed: number; pass_rate: number; rows: { name: string; returned: number; satisfying: number; pass: boolean; sample: string[] }[] } | null;
  sanity: { passed: number; total: number; checks: { name: string; pass: boolean; detail: string; hard: boolean }[] } | null;
  failures: { title: string; input: string; wrong: string; cause: string; mitigation: string }[];
  cost: { avg_tokens_in: number | null; avg_tokens_out: number | null; measured_calls: number; calls_per_session: number; per_session_usd: { assumed: number | null; conservative: number | null }; per_1000_users_usd: { assumed: number | null; conservative: number | null }; prices: Record<string, { model: string; in: number; out: number; source: string }>; notes: string };
};

const FIELD: Record<string, string> = { goal: "Məqsəd", property_type: "Əmlak növü", locations: "Yer", constraints: "Şərtlər", budget: "Büdcə" };

function Bars({ a, b, la = "AI (Gemini)", lb = "Açar söz qaydası" }: { a: number; b: number; la?: string; lb?: string }) {
  return (
    <div className="space-y-1">
      {[[la, a, "bg-caspian"], [lb, b, "bg-ink-3"]].map(([l, v, c]) => (
        <div key={l as string} className="grid grid-cols-[130px_1fr_44px] items-center gap-2 text-xs">
          <span className="text-ink-2">{l}</span>
          <div className="h-3 rounded bg-sand-3/60"><div className={`h-3 rounded ${c}`} style={{ width: `${v}%` }} /></div>
          <span className="num text-right font-bold">{v}%</span>
        </div>
      ))}
    </div>
  );
}

export default function Quality() {
  const e = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/evals.json"), "utf8")) as Evals;
  const usd = (v: number | null) => (v == null ? "—" : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <Link href="/xerite" className="text-sm font-bold text-caspian">← Xəritəyə qayıt</Link>
      <h1 className="mt-4 text-4xl font-extrabold tracking-[-0.035em] md:text-5xl">Keyfiyyət və testlər</h1>
      <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-ink-2">
        AI-ın nə qədər dəqiq olduğunu sadə qayda əsaslı yanaşma ilə müqayisə edirik, rəqəmlərin uydurulmadığını yoxlayırıq və məlumatın özünü testdən keçiririk. Bütün testlər <code className="rounded bg-sand-3/60 px-1">/evals</code> qovluğundadır və təkrar işlədilə bilər. Son yeniləmə: {e.generated_at.slice(0, 16).replace("T", " ")}.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-4">
        {[
          ["Niyyətin anlaşılması (yer)", e.intent ? `${e.intent.accuracy.ai.locations}%` : "—", e.intent ? `qayda: ${e.intent.accuracy.baseline.locations}%` : "test gözlənilir"],
          ["Hüquqi risk: recall", e.legal ? `${e.legal.ai.recall}%` : "—", e.legal ? `qayda: ${e.legal.baseline.recall}%` : "test gözlənilir"],
          ["Rəqəmlərin əsaslandırılması", e.grounding ? `${e.grounding.grounded_pct}%` : "—", e.grounding ? `${e.grounding.numbers} rəqəm yoxlandı` : ""],
          ["Şərtlərə uyğun nəticə", e.retrieval ? `${e.retrieval.pass_rate}%` : "—", e.retrieval ? `${e.retrieval.passed}/${e.retrieval.n} sorğu` : ""],
        ].map(([l, v, s]) => (
          <div key={l} className="rounded-xl border border-sand-3 bg-sand-2 p-4">
            <div className="text-xs font-semibold text-ink-3">{l}</div>
            <div className="num mt-1 text-3xl font-extrabold">{v}</div>
            <div className="text-[11px] text-ink-3">{s}</div>
          </div>
        ))}
      </div>

      <section className="mt-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-extrabold">1. Niyyət: AI vs açar söz qaydası</h2>
          <p className="mt-1 text-sm text-ink-2">{e.intent ? `${e.intent.n} Azərbaycan dilində sorğu (3 qeyri-müəyyən, 2 səhv yazılmış/danışıq dili). Sahə üzrə dəqiqlik.` : "Test hələ tamamlanmayıb."}</p>
          {e.intent && (
            <div className="mt-3 space-y-3">
              {Object.keys(FIELD).map((f) => (
                <div key={f}>
                  <div className="mb-1 text-xs font-bold">{FIELD[f]}</div>
                  <Bars a={e.intent!.accuracy.ai[f]} b={e.intent!.accuracy.baseline[f]} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className="text-xl font-extrabold">2. Hüquqi yoxlama: elanlarda risk</h2>
          <p className="mt-1 text-sm text-ink-2">{e.legal ? `${e.legal.n} elan mətni: 6 təmiz, 12 riskli (o cümlədən gizli risk: “sənədlər sonra düzələcək”).` : "Test hələ tamamlanmayıb."}</p>
          {e.legal && (
            <div className="mt-3 space-y-3">
              <div><div className="mb-1 text-xs font-bold">Recall (riskli elanların neçəsi tapıldı)</div><Bars a={e.legal.ai.recall} b={e.legal.baseline.recall} /></div>
              <div><div className="mb-1 text-xs font-bold">Precision (xəbərdarlıqların neçəsi doğrudur)</div><Bars a={e.legal.ai.precision} b={e.legal.baseline.precision} /></div>
              <p className="text-xs text-ink-3">Saytda ikisi birlikdə işləyir: qaydanın tapdığı ifadə AI siyahısına həmişə əlavə olunur, beləliklə məlum ifadələr heç vaxt buraxılmır.</p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-extrabold">3. Rəqəmlər uydurulurmu?</h2>
          {e.grounding && (
            <>
              <p className="mt-1 text-sm text-ink-2">{e.grounding.n_texts} AI mətnindəki hər rəqəm çıxarılıb və modelə verilən JSON-da (±1%) axtarılıb.</p>
              <div className="mt-3"><Bars a={e.grounding.grounded_pct} b={100} la="JSON-da tapıldı" lb="hədəf" /></div>
              <p className="mt-2 text-xs text-ink-3">Tapılmayan: {e.grounding.ungrounded}. Nümunələr: {e.grounding.rows.filter((r) => r.ungrounded).slice(0, 4).map((r) => `${r.id} → ${r.examples.join(", ")}`).join("; ") || "yoxdur"}</p>
            </>
          )}
        </div>
        <div>
          <h2 className="text-xl font-extrabold">4. Şərtlərə uyğunluq (retrieval)</h2>
          {e.retrieval && (
            <ul className="mt-2 space-y-1 text-xs">
              {e.retrieval.rows.map((r) => (
                <li key={r.name} className="flex justify-between gap-2 border-b border-sand-3/60 py-1">
                  <span>{r.pass ? "✓" : "✗"} {r.name}</span>
                  <span className="num text-ink-2">{r.satisfying}/{r.returned}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-extrabold">5. Məlumatın yoxlanılması</h2>
        {e.sanity && (
          <div className="mt-3 overflow-x-auto rounded-xl border border-sand-3 bg-sand-2">
            <table className="w-full min-w-[600px] text-sm">
              <tbody>
                {e.sanity.checks.map((c) => (
                  <tr key={c.name} className="border-b border-sand-3/60 last:border-0">
                    <td className={`px-3 py-2 font-bold ${c.pass ? "text-green" : c.hard ? "text-pomegranate" : "text-amber"}`}>{c.pass ? "✓" : c.hard ? "✗" : "!"}</td>
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2 text-xs text-ink-2">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-extrabold">6. Səhvlərimiz və necə düzəltdik</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {e.failures.map((f) => (
            <div key={f.title} className="rounded-xl border border-sand-3 bg-sand-2 p-4 text-sm">
              <div className="font-extrabold">{f.title}</div>
              <dl className="mt-2 space-y-1.5 text-[13px] leading-snug">
                <div><dt className="inline font-semibold text-ink-3">Giriş: </dt><dd className="inline">{f.input}</dd></div>
                <div><dt className="inline font-semibold text-pomegranate">Səhv nəticə: </dt><dd className="inline">{f.wrong}</dd></div>
                <div><dt className="inline font-semibold text-ink-3">Səbəb: </dt><dd className="inline">{f.cause}</dd></div>
                <div><dt className="inline font-semibold text-green">Həll: </dt><dd className="inline">{f.mitigation}</dd></div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-extrabold">7. Mövcud yanaşma ilə müqayisə</h2>
          <p className="mt-1 text-sm text-ink-2">Eyni tapşırıq (“Nərimanovda metroya yaxın, məktəbi olan 3 ərazi seç və qiymətini bil”): bina.az + Google Maps ilə əl ilə vs Məskən.</p>
          <table className="mt-3 w-full text-sm">
            <thead className="text-xs text-ink-3"><tr><th className="py-1 text-left">İştirakçı</th><th className="text-right">Əl ilə, dəq</th><th className="text-right">Məskən, dəq</th></tr></thead>
            <tbody>
              {[1, 2, 3].map((i) => (
                <tr key={i} className="border-t border-sand-3/60"><td className="py-1.5">İştirakçı {i}</td><td className="text-right text-ink-3">ölçülür</td><td className="text-right text-ink-3">ölçülür</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-3">İnsan testi aparılır; nəticələr və sitatlar bura əlavə olunacaq. Rəqəm olmayana qədər heç bir iddia etmirik.</p>
        </div>
        <div>
          <h2 className="text-xl font-extrabold">8. Xərc</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
            <li>Ölçülmüş orta: <b className="num text-ink">{e.cost.avg_tokens_in ?? "—"}</b> giriş + <b className="num text-ink">{e.cost.avg_tokens_out ?? "—"}</b> çıxış token / çağırış ({e.cost.measured_calls} çağırış)</li>
            <li>Sessiya (~{e.cost.calls_per_session} AI çağırışı): <b className="text-ink">{usd(e.cost.per_session_usd.assumed)}</b> (gemini-3.7-flash) … <b className="text-ink">{usd(e.cost.per_session_usd.conservative)}</b> (3.5-flash, ehtiyatlı)</li>
            <li>1000 istifadəçi: <b className="text-ink">{usd(e.cost.per_1000_users_usd.assumed)}</b> … <b className="text-ink">{usd(e.cost.per_1000_users_usd.conservative)}</b></li>
            <li className="text-xs text-ink-3">Qiymət mənbələri: {Object.values(e.cost.prices).map((p) => `${p.model}: $${p.in}/$${p.out} per 1M (${p.source})`).join("; ")}. {e.cost.notes}</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
