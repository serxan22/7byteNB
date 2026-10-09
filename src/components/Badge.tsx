import type { Badge as B } from "@/lib/types";
import { BADGE_HINT, BADGE_LABEL } from "@/lib/metrics";

const STYLE: Record<B, string> = {
  osm: "text-caspian border-caspian/40",
  official: "text-green border-green/40",
  computed: "text-ink-2 border-ink-3/40",
  sample: "text-amber border-amber/50",
  mock: "text-pomegranate border-pomegranate/50 bg-pomegranate/5",
  model: "text-ink-2 border-ink-3/40 italic",
  press: "text-amber border-amber/50",
};

export function Badge({ kind, className = "" }: { kind: B; className?: string }) {
  return (
    <span
      title={BADGE_HINT[kind]}
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-semibold leading-4 ${STYLE[kind]} ${className}`}
    >
      {BADGE_LABEL[kind]}
    </span>
  );
}
