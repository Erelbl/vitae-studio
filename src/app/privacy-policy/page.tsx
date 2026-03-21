import { LegalPage } from "@/components/legal/LegalPage";
import { PRIVACY_POLICY } from "@/content/legal/privacy";

export const metadata = { title: "מדיניות פרטיות – Vitae Studio" };

export default function PrivacyPolicyPage() {
  return <LegalPage {...PRIVACY_POLICY} />;
}
