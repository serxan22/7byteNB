"use client";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/** Segmented AZ | EN pill. Keeps the current page and query string (decision query, selected region); next-intl
 *  stores the choice in the NEXT_LOCALE cookie so the proxy never overrides it. */
export default function LangSwitch({ full = false }: { full?: boolean }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const idx = routing.locales.indexOf(locale);
  const go = (l: (typeof routing.locales)[number]) => {
    if (l === locale) return;
    const query = Object.fromEntries(new URLSearchParams(window.location.search));
    start(() => router.replace({ pathname, query }, { locale: l, scroll: false }));
  };
  return (
    <div role="group" aria-label={t("langSwitch")} className={`relative grid grid-cols-2 rounded-full border border-sand-3 bg-sand-2 p-0.5 text-xs font-bold ${full ? "w-full" : "w-[84px]"} ${pending ? "opacity-70" : ""}`}>
      <span aria-hidden="true" className="nav-pill absolute bottom-0.5 left-0.5 top-0.5 w-[calc(50%-2px)] rounded-full bg-caspian" style={{ transform: `translateX(${idx * 100}%)` }} />
      {routing.locales.map((l) => (
        <button key={l} type="button" aria-pressed={l === locale} lang={l} onClick={() => go(l)} className={`nav-item relative z-10 rounded-full px-2 py-1 ${l === locale ? "text-sand-2" : "text-ink-2 hover:text-ink"}`}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
