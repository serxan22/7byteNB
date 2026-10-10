import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { alternates } from "@/i18n/meta";
import type { AppLocale } from "@/i18n/routing";
import Compare from "@/components/Compare";

export async function generateMetadata({ params }: { params: Promise<{ locale: AppLocale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("compare"), description: t("description"), alternates: alternates("/muqayise", locale) };
}

export default async function Page({ params }: { params: Promise<{ locale: AppLocale }> }) {
  setRequestLocale((await params).locale);
  return <Compare />;
}
