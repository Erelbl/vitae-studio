export const ORDER_STATUSES = [
  "created",
  "questionnaire_complete",
  "enrichment_complete",
  "ready_for_payment",
  "photos_uploaded",
  "generating_text",
  "text_ready",
  "generating_illustrations",
  "preview_ready",
  "admin_review",
  "approved",
  "revision_requested",
  "generating_pdf",
  "delivered",
  "error_generation",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "paid", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PERSON_GENDERS = ["male", "female"] as const;
export type PersonGender = (typeof PERSON_GENDERS)[number];

export interface Order {
  id: string;
  created_at: string;
  updated_at: string;
  status: OrderStatus;
  person_name: string;
  person_gender: PersonGender;
  person_birth_date: string | null;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  occasion: string | null;
  language: string;
  total_pages: number;
  payment_status: PaymentStatus;
  payment_amount: number | null;
  payment_method: string | null;
  payment_date: string | null;
  admin_notes: string | null;
  customer_notes: string | null;
  pdf_storage_path: string | null;
  delivered_at: string | null;
  access_token: string | null;
  access_token_expires_at: string | null;
  video_storage_path: string | null;
  video_status: string | null;
  delivery_mode: DeliveryMode | null;
  album_size: AlbumSize | null;
  shipping_full_name: string | null;
  shipping_phone: string | null;
  shipping_city: string | null;
  shipping_street: string | null;
  shipping_apartment: string | null;
  shipping_postal_code: string | null;
  shipping_notes: string | null;
  pricing_snapshot: PricingSnapshot | null;
  currency: string;
}

export const DELIVERY_MODES = ["film", "print", "bundle"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const ALBUM_SIZES = ["25x25", "30x30"] as const;
export type AlbumSize = (typeof ALBUM_SIZES)[number];

export interface PricingSnapshot {
  delivery_mode: DeliveryMode;
  album_size: AlbumSize | null;
  includes_printed_album: boolean;
  includes_narrated_film: boolean;
  total_price_ils: number;
  currency: "ILS";
  computed_at: string;
}
