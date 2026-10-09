"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import ThemeToggle from "./ThemeToggle";

const I = {
  map: <path d="M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20V6.5Zm5.5-2.5v13.5m7-11v13.5" />,
  compare: <path d="M5 20V10m7 10V4m7 16v-7" />,
  check: <path d="M4 12.5 9 17.5 20 6.5" />,
  book: <path d="M5 4.5h9.5A3.5 3.5 0 0 1 18 8v11.5H8.5A3.5 3.5 0 0 1 5 16V4.5Zm0 11.5A3.5 3.5 0 0 1 8.5 12.5H18" />,
};
const ITEMS = [
  { href: "/xerite", label: "Xəritə", icon: I.map },
  { href: "/muqayise", label: "Müqayisə", icon: I.compare },
  { href: "/keyfiyyet", label: "Keyfiyyət", icon: I.check },
  { href: "/menbeler", label: "Mənbələr", icon: I.book },
];

/** Top navigation with a pill that slides to the active (or hovered) item. */
export default function TopNav({ hideMap = false }: { hideMap?: boolean }) {
  const path = usePathname();
  const items = hideMap ? ITEMS.filter((i) => i.href !== "/xerite") : ITEMS;
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const active = items.findIndex((i) => path?.startsWith(i.href));
  const [hover, setHover] = useState<number | null>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const target = hover ?? (active >= 0 ? active : null);
  useLayoutEffect(() => {
    const el = target != null ? refs.current[target] : null;
    setPill(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
  }, [target, path]);
  return (
    <nav className="flex items-center gap-1" aria-label="Əsas menyu" onMouseLeave={() => setHover(null)}>
      <div className="relative flex items-center gap-0.5 rounded-full p-0.5">
        {pill && (
          <span
            aria-hidden="true"
            className={`nav-pill absolute top-0.5 bottom-0.5 rounded-full ${hover != null && hover !== active ? "bg-sand-3/60" : "bg-caspian/12 ring-1 ring-caspian/25"}`}
            style={{ transform: `translateX(${pill.x}px)`, width: pill.w, left: 0 }}
          />
        )}
        {items.map((it, i) => (
          <Link
            key={it.href}
            href={it.href}
            ref={(el) => { refs.current[i] = el; }}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-current={i === active ? "page" : undefined}
            className={`nav-item relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${i === active ? "text-caspian" : "text-ink-2 hover:text-ink"}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 max-sm:hidden" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{it.icon}</svg>
            {it.label}
          </Link>
        ))}
      </div>
      <ThemeToggle />
    </nav>
  );
}
