import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Məskən — harada yaşamalı?",
  description:
    "Azərbaycanın hər rayonu və Bakının hər rayonu üzrə qiymət, xidmət, nəqliyyat, yol və təbiət göstəriciləri, AI təhlili və şəxsi uyğunluq xəritəsi.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="az" className={`${manrope.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
