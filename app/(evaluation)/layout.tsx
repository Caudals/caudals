import type { Metadata } from "next";
import "./evaluation.css";
export const metadata: Metadata = {
  title: "Evaluations | Caudals",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function EvaluationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
