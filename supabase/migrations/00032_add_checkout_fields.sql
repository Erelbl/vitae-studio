-- Add checkout / commerce fields to orders table
-- delivery_mode: 'film' | 'print' | 'bundle'
-- album_size: null (film-only) | '25x25' | '30x30'
-- shipping fields for physical album orders
-- pricing snapshot for audit trail

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT,
  ADD COLUMN IF NOT EXISTS album_size TEXT,
  ADD COLUMN IF NOT EXISTS shipping_full_name TEXT,
  ADD COLUMN IF NOT EXISTS shipping_phone TEXT,
  ADD COLUMN IF NOT EXISTS shipping_city TEXT,
  ADD COLUMN IF NOT EXISTS shipping_street TEXT,
  ADD COLUMN IF NOT EXISTS shipping_apartment TEXT,
  ADD COLUMN IF NOT EXISTS shipping_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS shipping_notes TEXT,
  ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'ILS';

-- Constraints
ALTER TABLE orders
  ADD CONSTRAINT chk_delivery_mode
    CHECK (delivery_mode IS NULL OR delivery_mode IN ('film', 'print', 'bundle'));

ALTER TABLE orders
  ADD CONSTRAINT chk_album_size
    CHECK (album_size IS NULL OR album_size IN ('25x25', '30x30'));

-- Add ready_for_payment to the allowed order statuses
-- First drop and recreate the check constraint on status
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'created',
    'questionnaire_complete',
    'enrichment_complete',
    'photos_uploaded',
    'generating_text',
    'text_ready',
    'generating_illustrations',
    'preview_ready',
    'admin_review',
    'approved',
    'revision_requested',
    'generating_pdf',
    'delivered',
    'error_generation',
    'ready_for_payment'
  )
);

-- Save current questionnaire step for resume
ALTER TABLE questionnaire_responses
  ADD COLUMN IF NOT EXISTS current_step INT NOT NULL DEFAULT 0;
