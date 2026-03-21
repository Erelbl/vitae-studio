import { LegalPage } from "@/components/legal/LegalPage";
import { SHIPPING_POLICY } from "@/content/legal/shipping";

export const metadata = { title: "מדיניות משלוחים – Vitae Studio" };

export default function ShippingPolicyPage() {
  return <LegalPage {...SHIPPING_POLICY} />;
}
