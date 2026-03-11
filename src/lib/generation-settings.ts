import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationSettings, SettingType } from "@/types/page";

/**
 * Resolve the active GenerationSettings for a given order and setting type.
 *
 * Resolution rule (locked decision):
 *   1. Look for an active, order-specific row: order_id = orderId AND setting_type = type
 *   2. If none found, fall back to an active global row: order_id IS NULL AND setting_type = type
 *   3. If multiple active rows exist for the same scope and type → configuration error, throw.
 *      Do not silently pick one.
 *   4. If no settings exist at all → throw. AI calls must never proceed without tracked settings.
 *
 * Always use this function before making any AI provider call.
 * Pass the returned settings.id as generation_settings_id on the processing_job row.
 */
export async function resolveGenerationSettings(
  supabase: SupabaseClient,
  orderId: string,
  type: SettingType
): Promise<GenerationSettings> {
  // Step 1: order-specific active settings
  const { data: orderSpecific, error: orderError } = await supabase
    .from("generation_settings")
    .select("*")
    .eq("order_id", orderId)
    .eq("setting_type", type)
    .eq("is_active", true);

  if (orderError) {
    throw new Error(
      `Failed to query order-specific generation settings: ${orderError.message}`
    );
  }

  if (orderSpecific && orderSpecific.length > 1) {
    throw new Error(
      `Configuration error: ${orderSpecific.length} active order-specific generation_settings rows found for order ${orderId}, type "${type}". Deactivate all but one.`
    );
  }

  if (orderSpecific && orderSpecific.length === 1) {
    return orderSpecific[0] as GenerationSettings;
  }

  // Step 2: global active settings (order_id IS NULL)
  const { data: global, error: globalError } = await supabase
    .from("generation_settings")
    .select("*")
    .is("order_id", null)
    .eq("setting_type", type)
    .eq("is_active", true);

  if (globalError) {
    throw new Error(
      `Failed to query global generation settings: ${globalError.message}`
    );
  }

  if (global && global.length > 1) {
    throw new Error(
      `Configuration error: ${global.length} active global generation_settings rows found for type "${type}". Deactivate all but one.`
    );
  }

  if (global && global.length === 1) {
    return global[0] as GenerationSettings;
  }

  // Step 4: no settings found at all
  throw new Error(
    `No active generation_settings found for type "${type}" (checked order-specific for ${orderId} and global). Seed default settings before making AI calls.`
  );
}
