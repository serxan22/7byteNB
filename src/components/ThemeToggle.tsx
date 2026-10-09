"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    let t: string | null = null;
    try {
      t = localStorage.getItem("theme");
    } catch {}
    const initial = (t as "light" | "dark") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
  }, []);
  useEffect(() => {
    if (!theme) return;
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {}
  }, [theme]);
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="rounded-md px-1.5 py-1 text-ink-2 hover:text-caspian"
      aria-label={theme === "dark" ? "İşıqlı rejim" : "Qaranlıq rejim"}
      title={theme === "dark" ? "İşıqlı rejim" : "Qaranlıq rejim"}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
