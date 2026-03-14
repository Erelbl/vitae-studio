import type { FilmProject, NarrationMode, MotionStyle } from "@/types/film";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CreateFilmProjectInput {
  orderId: string;
  narrationMode?: NarrationMode;
  motionStyle?: MotionStyle;
}

export interface CreateFilmProjectResult {
  filmProject: FilmProject;
}

/**
 * Creates a new film project for an order.
 * Validates that the order exists and has no existing film project.
 */
export async function createFilmProject(
  input: CreateFilmProjectInput
): Promise<CreateFilmProjectResult> {
  const adminClient = createAdminClient();

  // Verify order exists
  const { data: order, error: orderError } = await adminClient
    .from("orders")
    .select("id")
    .eq("id", input.orderId)
    .single();

  if (orderError || !order) {
    throw new Error(`Order not found: ${input.orderId}`);
  }

  // Check no existing film project
  const { data: existing } = await adminClient
    .from("film_projects")
    .select("id")
    .eq("order_id", input.orderId)
    .single();

  if (existing) {
    throw new Error(`Film project already exists for order ${input.orderId}`);
  }

  const { data: filmProject, error } = await adminClient
    .from("film_projects")
    .insert({
      order_id: input.orderId,
      narration_mode: input.narrationMode ?? "ai",
      motion_style: input.motionStyle ?? "gentle",
    })
    .select()
    .single();

  if (error || !filmProject) {
    throw new Error(`Failed to create film project: ${error?.message}`);
  }

  return { filmProject: filmProject as unknown as FilmProject };
}
