import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveGenerationSettings } from "@/lib/generation-settings";
import { buildStoryProfile } from "@/services/story/story-profile-builder";
import { improveStoryRhyme } from "@/services/story/rhyme-improver";
import { evaluateStoryRhyme } from "@/services/story/rhyme-evaluator";
import type { QuestionnaireResponses, FollowUpQA } from "@/types/questionnaire";
import type { GenerationSettings } from "@/types/page";

// Allow enough time for two Claude calls (improve + evaluate)
export const maxDuration = 180;

// POST /api/admin/orders/[orderId]/improve-rhyme
//
// Admin-only. Runs a focused rhyme-improvement pass on the current story pages.
// Does NOT regenerate the story from scratch. Preserves all facts and structure.
// Saves results as new page_versions (increments text_version per page).
// Runs evaluation on the improved text and stores in orders.story_evaluation.
// Runs synchronously — returns 200 with results when done.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // Verify admin session
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { orderId } = await params;
  const adminClient = createAdminClient();

  // ── Load order ──
  const { data: order } = await adminClient
    .from("orders")
    .select("person_name, person_gender, status")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // ── Load current pages ──
  const { data: pagesRaw } = await adminClient
    .from("pages")
    .select("id, page_number, page_type, text_content, text_version")
    .eq("order_id", orderId)
    .order("page_number");

  if (!pagesRaw || pagesRaw.length === 0) {
    return NextResponse.json(
      { error: "No pages found — generate a story first" },
      { status: 409 }
    );
  }

  // ── Load questionnaire + follow-ups for profile building ──
  const { data: qData } = await adminClient
    .from("questionnaire_responses")
    .select("responses, followup_questions")
    .eq("order_id", orderId)
    .single();

  const responses = (qData?.responses as Partial<QuestionnaireResponses>) ?? {};
  const followupQA = (qData?.followup_questions as FollowUpQA[]) ?? [];
  const personName = (order.person_name as string | null) ?? "";
  const personGender =
    (order.person_gender as "male" | "female" | null) ?? "male";

  const profile = buildStoryProfile(responses, followupQA, personName, personGender);

  // ── Resolve generation settings (soft-fail) ──
  let generationSettings: GenerationSettings | null = null;
  try {
    generationSettings = await resolveGenerationSettings(
      adminClient,
      orderId,
      "story"
    );
  } catch {
    // Use defaults
  }

  const pages = pagesRaw.map((p) => ({
    id: p.id as string,
    page_number: p.page_number as number,
    page_type: (p.page_type as string) ?? "illustration_and_text",
    text_content: (p.text_content as string | null) ?? null,
    text_version: (p.text_version as number) ?? 1,
  }));

  console.log(
    `[improve-rhyme] orderId=${orderId} pages=${pages.length} starting improvement`
  );

  // ── Run rhyme improvement ──
  const improvedPages = await improveStoryRhyme(pages, profile, generationSettings);

  // ── Persist improved text as new page_versions ──
  const versionRows: {
    page_id: string;
    version_type: string;
    version_number: number;
    content: string;
    generation_settings_id: string | null;
    input_snapshot: Record<string, unknown>;
    output_metadata: Record<string, unknown>;
    created_by: string;
  }[] = [];

  for (const improved of improvedPages) {
    const original = pages.find((p) => p.page_number === improved.page_number);
    if (!original) continue;
    if (
      !improved.text_content ||
      improved.page_type === "cover" ||
      improved.page_type === "back_cover"
    )
      continue;

    const newVersion = original.text_version + 1;

    // Update pages row
    await adminClient
      .from("pages")
      .update({
        text_content: improved.text_content,
        text_version: newVersion,
        admin_text_override: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", original.id);

    versionRows.push({
      page_id: original.id,
      version_type: "text",
      version_number: newVersion,
      content: improved.text_content,
      generation_settings_id: generationSettings?.id ?? null,
      input_snapshot: {
        order_id: orderId,
        page_number: original.page_number,
        source: "improve_rhyme",
      },
      output_metadata: { source: "improve_rhyme" },
      created_by: "generation",
    });
  }

  if (versionRows.length > 0) {
    const { error: versionsError } = await adminClient
      .from("page_versions")
      .insert(versionRows);

    if (versionsError) {
      console.error(
        "[improve-rhyme] Failed to save page_versions:",
        versionsError.message
      );
      // Non-fatal — page text is already updated
    }
  }

  console.log(
    `[improve-rhyme] Saved ${versionRows.length} improved page versions`
  );

  // ── Run evaluation on improved story ──
  let evaluation = null;
  try {
    const pagesForEval = improvedPages
      .filter((p) => p.page_type !== "cover" && p.page_type !== "back_cover")
      .map((p) => ({
        page_number: p.page_number,
        text_content: p.text_content,
        page_type: p.page_type,
      }));

    evaluation = await evaluateStoryRhyme(pagesForEval);

    await adminClient
      .from("orders")
      .update({ story_evaluation: evaluation })
      .eq("id", orderId);

    console.log(
      `[improve-rhyme] evaluation: rhyme=${evaluation.rhyme_score} flow=${evaluation.hebrew_flow_score} overall=${evaluation.overall_story_score}`
    );
  } catch (evalErr) {
    console.warn("[improve-rhyme] Evaluation failed (non-fatal):", evalErr);
  }

  return NextResponse.json({
    status: "completed",
    pages_improved: versionRows.length,
    evaluation,
  });
}
