"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SUGGESTIONS } from "./Advisor";

export default function HeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const go = (text: string) => text.trim() && router.push(`/xerite?q=${encodeURIComponent(text.trim())}`);
  return (
    <div className="mt-8 max-w-2xl">
      <form onSubmit={(e) => { e.preventDefault(); go(q); }} className="flex gap-2 rounded-2xl border border-sand-3 bg-sand-2 p-2 shadow-sm focus-within:border-caspian">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nə axtarırsan? Məs: uşaqlı ailəyik, Yasamalda məktəbə yaxın ev" aria-label="Nə axtarırsan?" className="h-12 min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-ink-3" />
        <button className="h-12 shrink-0 rounded-xl bg-caspian px-6 text-base font-bold text-sand-2">Axtar</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => go(s)} className="rounded-full border border-sand-3 bg-sand/70 px-3 py-1.5 text-xs text-ink-2 hover:border-caspian hover:text-caspian">{s}</button>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-3">və ya <a href="/xerite" className="underline">xəritəni özün araşdır</a></p>
    </div>
  );
}
