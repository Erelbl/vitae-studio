import { z } from "zod/v4";

export const deliveryModeSchema = z.enum(["film", "print", "bundle"]);
export const albumSizeSchema = z.enum(["25x25", "30x30"]);

export const shippingSchema = z.object({
  shipping_full_name: z.string().min(2, "נדרשים לפחות 2 תווים"),
  shipping_phone: z.string().min(9, "מספר טלפון לא תקין"),
  shipping_city: z.string().min(2, "נדרש שם עיר"),
  shipping_street: z.string().min(2, "נדרשת כתובת רחוב ומספר בית"),
  shipping_apartment: z.string().min(1, "נדרש קומה/דירה"),
  shipping_postal_code: z.string().min(5, "מיקוד לא תקין"),
  shipping_notes: z.string().optional().default(""),
});

export type ShippingData = z.infer<typeof shippingSchema>;

/** Full checkout submission — validated server-side before moving to ready_for_payment. */
export const checkoutSchema = z
  .object({
    delivery_mode: deliveryModeSchema,
    album_size: albumSizeSchema.nullable(),
    shipping: shippingSchema.nullable(),
  })
  .check((ctx) => {
    const { delivery_mode, album_size, shipping } = ctx.value;

    // Film: must NOT have album_size or shipping
    if (delivery_mode === "film") {
      if (album_size !== null) {
        ctx.issues.push({
          code: "custom",
          input: album_size,
          message: "אין צורך בבחירת גודל אלבום עבור סרט בלבד",
          path: ["album_size"],
        });
      }
      if (shipping !== null) {
        ctx.issues.push({
          code: "custom",
          input: shipping,
          message: "אין צורך בפרטי משלוח עבור סרט בלבד",
          path: ["shipping"],
        });
      }
    }

    // Print / Bundle: MUST have album_size and shipping
    if (delivery_mode === "print" || delivery_mode === "bundle") {
      if (album_size === null) {
        ctx.issues.push({
          code: "custom",
          input: album_size,
          message: "יש לבחור גודל אלבום",
          path: ["album_size"],
        });
      }
      if (shipping === null) {
        ctx.issues.push({
          code: "custom",
          input: shipping,
          message: "נדרשים פרטי משלוח",
          path: ["shipping"],
        });
      }
    }
  });

export type CheckoutData = z.infer<typeof checkoutSchema>;

/** Schema for saving product selection (intermediate save, before full checkout). */
export const productSelectionSchema = z.object({
  delivery_mode: deliveryModeSchema,
});
