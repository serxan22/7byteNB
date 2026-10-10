import type { Hex } from "@/lib/decide";
import type { Region } from "@/lib/types";
import { useLocale, useTranslations } from "next-intl";
import { fmt, fmtAZN, priceBadge } from "@/lib/metrics";
import { localizeLabel } from "@/lib/labels";
import { Badge } from "./Badge";

/** Compact micro-area (H3 hex) card. Prices are the parent district average — said explicitly. */
export default function HexCard({ hex, cats, parent }: { hex: Hex; cats: string[]; parent: Region }) {
  const t = useTranslations("hex");
  const tc = useTranslations("common");
  const tp = useTranslations("poi");
  const locale = useLocale();
  const n = (c: string) => hex.p[cats.indexOf(c)] ?? 0;
  const price = parent.prices.menzil_kohne;
  const dist: [string, number | null][] = [
    [hex.mn ? t("metroNamed", { name: hex.mn }) : t("metro"), hex.m],
    [t("busStop"), hex.s],
    [t("school"), hex.sc],
    [t("kindergarten"), hex.k],
    [t("park"), hex.pk],
  ];
  return (
    <div className="fade-in border-b border-sand-3 bg-sand p-4">
      <div className="text-[11px] font-semibold text-ink-3">{t("header", { area: hex.a != null ? `${fmt(hex.a, 2)} km² · ` : "" })}</div>
      <div className="text-lg font-extrabold leading-tight">{localizeLabel(hex.l, locale)}</div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {dist.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <span className="truncate text-ink-2">{k}</span>
            <span className="num font-bold">{v != null ? `${fmt(v)} m` : tc("noData")}</span>
          </div>
        ))}
        <div className="flex justify-between gap-2">
          <span className="text-ink-2">{t("paved")}</span>
          <span className="num font-bold">{hex.pv != null ? `${hex.pv}%` : tc("noData")}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {["grocery", "pharmacy", "food", "school", "kindergarten", "clinic", "bank_atm", "park"].map((c) => (
          <span key={c} className="rounded bg-sand-3/70 px-1.5 py-0.5">{tp(c as "pharmacy")}: <b className="num">{n(c)}</b></span>
        ))}
      </div>
      {hex.pm != null && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-sand-2 px-3 py-2 text-xs">
          <span>{t.rich("hexPrice", { price: fmtAZN(hex.pm, "m²"), n: hex.pn ?? 0, b: (c) => <b className="num">{c}</b> })}</span>
          <Badge kind="sample" />
        </div>
      )}
      <div className="mt-2 flex items-center justify-between rounded-lg bg-sand-2 px-3 py-2 text-xs">
        <span>{t.rich("districtPrice", { price: price?.value != null ? fmtAZN(price.value, "m²") : tc("noData"), b: (c) => <b className="num">{c}</b>, i: (c) => <i>{c}</i> })}</span>
        {price && <Badge kind={priceBadge(price)} />}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-ink-3"><Badge kind="osm" /> {t("distNote")}</div>
    </div>
  );
}
