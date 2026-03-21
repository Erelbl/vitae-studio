import { LegalPage } from "@/components/legal/LegalPage";
import { REFUND_POLICY } from "@/content/legal/refund";

export const metadata = { title: "ביטולים והחזרים – Vitae Studio" };

export default function RefundPolicyPage() {
  return <LegalPage {...REFUND_POLICY} />;
}
