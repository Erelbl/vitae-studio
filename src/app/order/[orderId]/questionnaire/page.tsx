import { QuestionnaireWizard } from "@/components/questionnaire/QuestionnaireWizard";

export default async function QuestionnairePage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { orderId } = await params;
  const { token = "" } = await searchParams;

  return <QuestionnaireWizard orderId={orderId} token={token} />;
}
