import type { AlbumType, QuestionnaireConfig } from "./types";
import { singleConfig } from "./single";
import { coupleConfig } from "./couple";
import { memorialConfig } from "./memorial";

const configs: Record<AlbumType, QuestionnaireConfig> = {
  single: singleConfig,
  couple: coupleConfig,
  memorial: memorialConfig,
};

export function getQuestionnaireConfig(albumType: AlbumType): QuestionnaireConfig {
  return configs[albumType];
}

export { type AlbumType, type QuestionnaireConfig, type StepConfig, type FieldConfig } from "./types";
export { buildAllSchemas, buildStepSchema } from "./schema-builder";
