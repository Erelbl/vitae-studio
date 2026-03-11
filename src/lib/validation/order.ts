import { z } from "zod/v4";

// person_name and person_gender are collected in the questionnaire.
// Order creation from the landing page only needs a language preference.
export const createOrderSchema = z.object({
  person_name: z.string().default(""),
  person_gender: z.enum(["male", "female"]).default("male"),
  language: z.string().default("he"),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
