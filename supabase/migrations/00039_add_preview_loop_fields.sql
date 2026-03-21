-- Add preview loop fields to orders table
-- Supports the preview review cycle: draft → sent_to_customer → changes_requested → approved

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS preview_status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS preview_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS preview_round INTEGER DEFAULT 0;

-- Constrain preview_status to valid values
ALTER TABLE orders
  ADD CONSTRAINT orders_preview_status_check
  CHECK (preview_status IN ('draft', 'sent_to_customer', 'changes_requested', 'approved'));
