import { z } from "zod/v4";

export const createOrderSchema = z.object({
  person_name: z.string().min(2, "נדרשים לפחות 2 תווים"),
  person_gender: z.enum(["male", "female"]),
  language: z.string().default("he"),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
