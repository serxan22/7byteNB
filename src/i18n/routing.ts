import { defineRouting } from "next-intl/routing";

// Azerbaijani is the default and keeps its URLs unprefixed (/xerite); English lives under /en/…
export const routing = defineRouting({
  locales: ["az", "en"],
  defaultLocale: "az",
  localePrefix: "as-needed",
  localeCookie: { name: "NEXT_LOCALE", maxAge: 60 * 60 * 24 * 365 },
});
export type AppLocale = (typeof routing.locales)[number];
