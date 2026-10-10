import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { alternates } from "@/i18n/meta";
import LocaleSync from "@/components/LocaleSync";
import "maplibre-gl/dist/maplibre-gl.css";
import "../globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as "az", namespace: "meta" });
  return {
    metadataBase: new URL("https://meskan-seven.vercel.app"),
    title: t("title"),
    description: t("description"),
    alternates: alternates("/", locale),
    openGraph: { title: t("title"), description: t("description"), locale: locale === "en" ? "en_GB" : "az_AZ", type: "website", siteName: "Məskən" },
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale} className={`${manrope.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <LocaleSync locale={locale} />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
