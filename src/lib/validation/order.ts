import { z } from "zod/v4";

// person_name and person_gender are collected in the questionnaire.
// buyer_name and buyer_email are collected upfront via the pre-start dialog.
export const createOrderSchema = z.object({
  person_name: z.string().default(""),
  person_gender: z.enum(["male", "female"]).default("male"),
  language: z.string().default("he"),
  buyer_name: z.string().default(""),
  buyer_email: z.string().default(""),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
