"use client";
import { setNumberLocale } from "@/lib/metrics";

/** Makes the shared number formatter use the active locale before any child renders. */
export default function LocaleSync({ locale }: { locale: string }) {
  setNumberLocale(locale);
  return null;
}
