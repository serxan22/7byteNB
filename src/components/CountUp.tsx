"use client";
import { useEffect, useState } from "react";
import { fmt } from "@/lib/metrics";

/** Animates a number from 0 on change (≈600 ms, ease-out); respects prefers-reduced-motion. */
export default function CountUp({ value, digits = 0 }: { value: number; digits?: number }) {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (typeof window === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 600);
      setV(value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{fmt(digits ? v : Math.round(v), digits)}</>;
}
