-- Add fulfillment tracking fields for the order lifecycle
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS sent_to_print_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipped_to_customer_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
