import type { Metadata } from "next";
import { EmailUnsubscribe } from "@/components/evals/email-unsubscribe";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Public: unsubscribe from lifecycle email with the token in the fragment (launch L-07). */
export default function UnsubscribePage() {
  return <EmailUnsubscribe />;
}
