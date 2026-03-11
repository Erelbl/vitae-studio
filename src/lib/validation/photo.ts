import { z } from "zod/v4";

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MIN_PHOTOS = 10;
export const MAX_PHOTOS = 40;

const lifeStageEnum = z.enum([
  "baby",
  "childhood",
  "youth",
  "military",
  "career",
  "wedding",
  "family",
  "recent",
  "other",
]);

// Schema for the initial POST: create a photo record and get a signed upload URL.
// display_order is optional — server auto-assigns (append to end) if omitted.
export const photoUploadSchema = z.object({
  filename: z.string().min(1),
  mime_type: z.enum(ALLOWED_MIME_TYPES, {
    error: "סוג קובץ לא נתמך. יש להעלות JPEG, PNG, WebP או HEIC",
  }),
  file_size_bytes: z
    .number()
    .max(MAX_FILE_SIZE_BYTES, "גודל הקובץ המרבי הוא 10MB"),
  life_stage: lifeStageEnum.optional(),
  caption: z.string().max(200).optional(),
  display_order: z.number().int().min(0).optional(),
});

// Schema for PATCH /photos/[photoId].
// Covers two cases:
//   1. Confirm upload complete: { is_uploaded: true } (optionally with width/height)
//   2. Update metadata: any subset of caption, life_stage, display_order
export const photoUpdateSchema = z
  .object({
    is_uploaded: z.boolean().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    life_stage: lifeStageEnum.nullable().optional(),
    caption: z.string().max(200).nullable().optional(),
    display_order: z.number().int().min(0).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

// Schema for PUT /photos/reorder.
// Sends the full desired order as an array of {id, display_order} pairs.
// The server validates all IDs belong to the order before writing.
export const photoReorderSchema = z.object({
  photos: z
    .array(
      z.object({
        id: z.string().uuid(),
        display_order: z.number().int().min(0),
      })
    )
    .min(1),
});

export type PhotoUploadInput = z.infer<typeof photoUploadSchema>;
export type PhotoUpdateInput = z.infer<typeof photoUpdateSchema>;
export type PhotoReorderInput = z.infer<typeof photoReorderSchema>;
