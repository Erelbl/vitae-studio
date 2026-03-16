/**
 * Canonical questionnaire field metadata — single source of truth for field labels.
 * Used by the read-only review screen. Generated from questionnaire config files.
 */

import { getQuestionnaireConfig } from "@/questionnaires";
import type { AlbumType, FieldConfig } from "@/questionnaires/types";

export interface FieldMeta {
  key: string;
  label: string;
  /** Optional display-value map for enum fields */
  displayValues?: Record<string, string>;
}

export interface SectionMeta {
  title: string;
  fields: FieldMeta[];
}

/** Build display-value map for select fields */
function buildDisplayValues(field: FieldConfig): Record<string, string> | undefined {
  if (field.type !== "select" || !field.options) return undefined;
  const map: Record<string, string> = {};
  for (const opt of field.options) {
    map[opt.value] = opt.label;
  }
  // Add legacy English fallbacks for gender
  if (field.name === "person_gender") {
    map["male"] = "זכר";
    map["female"] = "נקבה";
  }
  return map;
}

/** Generate section metadata from a questionnaire config for the review screen */
export function getQuestionnaireSections(albumType: AlbumType): SectionMeta[] {
  const config = getQuestionnaireConfig(albumType);
  return config.steps.map((step) => ({
    title: step.label,
    fields: step.fields.map((field) => ({
      key: field.name,
      label: field.label,
      displayValues: buildDisplayValues(field),
    })),
  }));
}

/**
 * Legacy export for backward compatibility.
 * Falls back to "single" config which matches the old hardcoded sections.
 */
export const QUESTIONNAIRE_SECTIONS: SectionMeta[] = getQuestionnaireSections("single");
