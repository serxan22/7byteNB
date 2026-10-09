import type { Metadata } from "next";
import Compare from "@/components/Compare";

export const metadata: Metadata = { title: "Müqayisə — Məskən" };

export default function Page() {
  return <Compare />;
}
