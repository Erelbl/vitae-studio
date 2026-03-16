-- Payment system: payment_attempts table + invoice fields on orders + new statuses

-- 1. payment_attempts table — tracks each payment attempt with provider details
CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Provider identification
  provider TEXT NOT NULL DEFAULT 'cardcom',
  provider_page_code TEXT,           -- CardCom LowProfileCode / page identifier
  provider_transaction_id TEXT,      -- CardCom InternalDealNumber
  provider_approval_number TEXT,     -- CardCom ApprovalNumber

  -- Internal reference passed to provider and back
  return_value TEXT NOT NULL,        -- our opaque reference = 'pa_<id>'

  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'redirected', 'completed', 'failed', 'cancelled')),

  -- Financial
  amount_ils INT NOT NULL,           -- amount in agorot (ILS * 100) for precision
  currency TEXT NOT NULL DEFAULT 'ILS',

  -- Invoice from provider
  invoice_number TEXT,
  invoice_type TEXT,

  -- Raw provider payloads for audit
  provider_create_response JSONB,    -- response from creating the payment page
  provider_webhook_payload JSONB,    -- raw webhook/report payload

  -- Error tracking
  error_message TEXT,

  paid_at TIMESTAMPTZ
);

CREATE INDEX idx_payment_attempts_order_id ON payment_attempts(order_id);
CREATE INDEX idx_payment_attempts_return_value ON payment_attempts(return_value);
CREATE INDEX idx_payment_attempts_provider_tx ON payment_attempts(provider_transaction_id);

-- 2. Invoice fields on orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS invoice_status TEXT DEFAULT 'none'
    CHECK (invoice_status IN ('none', 'issued', 'failed'));

-- 3. Add payment_pending status to allowed order statuses
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'created',
    'questionnaire_complete',
    'enrichment_complete',
    'ready_for_payment',
    'payment_pending',
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
    'error_generation'
  )
);

-- 4. Auto-update updated_at on payment_attempts
CREATE OR REPLACE FUNCTION update_payment_attempts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_attempts_updated_at
  BEFORE UPDATE ON payment_attempts
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_attempts_updated_at();
