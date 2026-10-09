import type { Hex } from "@/lib/decide";
import type { Region } from "@/lib/types";
import { fmt, POI_LABEL, priceBadge } from "@/lib/metrics";
import { Badge } from "./Badge";

/** Compact micro-area (H3 hex) card. Prices are the parent district average — said explicitly. */
export default function HexCard({ hex, cats, parent }: { hex: Hex; cats: string[]; parent: Region }) {
  const n = (c: string) => hex.p[cats.indexOf(c)] ?? 0;
  const price = parent.prices.menzil_kohne;
  const dist: [string, number | null][] = [
    [hex.mn ? `Metro (${hex.mn})` : "Metro", hex.m],
    ["Avtobus dayanacağı", hex.s],
    ["Məktəb", hex.sc],
    ["Uşaq bağçası", hex.k],
    ["Park", hex.pk],
  ];
  return (
    <div className="fade-in border-b border-sand-3 bg-sand p-4">
      <div className="text-[11px] font-semibold text-ink-3">Məhəllə · {hex.a != null ? `${hex.a} km² · ` : ""}təxmini sərhəd (OSM + Voronoi)</div>
      <div className="text-lg font-extrabold leading-tight">{hex.l}</div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {dist.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <span className="truncate text-ink-2">{k}</span>
            <span className="num font-bold">{v != null ? `${fmt(v)} m` : "məlumat yoxdur"}</span>
          </div>
        ))}
        <div className="flex justify-between gap-2">
          <span className="text-ink-2">Asfalt yollar</span>
          <span className="num font-bold">{hex.pv != null ? `${hex.pv}%` : "məlumat yoxdur"}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {["grocery", "pharmacy", "food", "school", "kindergarten", "clinic", "bank_atm", "park"].map((c) => (
          <span key={c} className="rounded bg-sand-3/70 px-1.5 py-0.5">{POI_LABEL[c]}: <b className="num">{n(c)}</b></span>
        ))}
      </div>
      {hex.pm != null && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-sand-2 px-3 py-2 text-xs">
          <span>Bu məhəllədə mənzil: <b className="num">{fmt(hex.pm)} ₼/m²</b> — {hex.pn} elanın medianı (2024)</span>
          <Badge kind="sample" />
        </div>
      )}
      <div className="mt-2 flex items-center justify-between rounded-lg bg-sand-2 px-3 py-2 text-xs">
        <span>Köhnə tikili: <b className="num">{price?.value != null ? `${fmt(price.value)} ₼/m²` : "məlumat yoxdur"}</b> — <i>rayon ortası</i>, məhəllə qiyməti deyil</span>
        {price && <Badge kind={priceBadge(price)} />}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-ink-3"><Badge kind="osm" /> Məsafələr düz xətlə, məhəllə daxilində orta (sahəyə görə çəkili).</div>
    </div>
  );
}
