import type { Metadata } from "next";
import Explorer from "@/components/Explorer";

export const metadata: Metadata = { title: "Xəritə — Məskən" };

export default function Page() {
  return <Explorer />;
}
