export const ORDER_STATUSES = [
  "created",
  "questionnaire_complete",
  "enrichment_complete",
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
}
