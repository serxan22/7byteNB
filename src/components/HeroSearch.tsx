"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { SUGGESTION_KEYS } from "./Advisor";

export default function HeroSearch() {
  const router = useRouter();
  const t = useTranslations("landing");
  const ta = useTranslations("advisor");
  const [q, setQ] = useState("");
  const go = (text: string) => text.trim() && router.push({ pathname: "/xerite", query: { q: text.trim() } });
  return (
    <div className="mt-8 max-w-2xl">
      <form onSubmit={(e) => { e.preventDefault(); go(q); }} className="flex gap-2 rounded-2xl border border-sand-3 bg-sand-2 p-2 shadow-sm focus-within:border-caspian">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPh")} aria-label={ta("inputLabel")} className="h-12 min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-ink-3" />
        <button className="btn-primary h-12 shrink-0 rounded-xl bg-caspian px-6 text-base font-bold text-sand-2">{t("searchBtn")}</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTION_KEYS.map((k) => ta(`suggest.${k}`)).map((s) => (
          <button key={s} onClick={() => go(s)} className="chip rounded-full border border-sand-3 bg-sand/70 px-3 py-1.5 text-xs text-ink-2 hover:border-caspian hover:text-caspian">{s}</button>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-3">{t.rich("orExplore", { link: (c) => <Link href="/xerite" className="underline">{c}</Link> })}</p>
    </div>
  );
}
