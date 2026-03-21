import { LegalPage } from "@/components/legal/LegalPage";
import { TERMS_OF_SERVICE } from "@/content/legal/terms";

export const metadata = { title: "תנאי שימוש – Vitae Studio" };

export default function TermsOfServicePage() {
  return <LegalPage {...TERMS_OF_SERVICE} />;
}
