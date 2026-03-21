-- Add customer feedback fields for the preview review loop
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS preview_feedback TEXT,
  ADD COLUMN IF NOT EXISTS preview_feedback_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS preview_approved_at TIMESTAMPTZ;
