import { z } from "zod/v4";
import type { FieldConfig, StepConfig } from "./types";

/** Build a Zod schema from a step's field config */
export function buildStepSchema(step: StepConfig) {
  const shape: Record<string, z.ZodType> = {};

  for (const field of step.fields) {
    let schema: z.ZodType;

    if (field.type === "select" && field.options) {
      const values = field.options.map((o) => o.value) as [string, ...string[]];
      schema = z.enum(values, { error: "יש לבחור ערך" });
    } else if (field.type === "date") {
      schema = z.string();
    } else {
      // text / textarea
      schema = z.string();
    }

    if (field.required) {
      // Required text/textarea fields need minimum length
      if (field.type === "text" || field.type === "textarea") {
        const minLen = field.type === "textarea" ? 5 : 2;
        schema = z.string().min(minLen, `נדרשים לפחות ${minLen} תווים`);
      }
    } else {
      schema = schema.optional().default("");
    }

    shape[field.name] = schema;
  }

  return z.object(shape);
}

/** Build step schemas + full merged schema from all steps */
export function buildAllSchemas(steps: StepConfig[]) {
  const stepSchemas = steps.map((step) => buildStepSchema(step));
  const fullSchema = stepSchemas.reduce((acc, schema) => acc.merge(schema));
  return { stepSchemas, fullSchema };
}
