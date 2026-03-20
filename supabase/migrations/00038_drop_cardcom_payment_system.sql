-- Remove Cardcom-specific payment infrastructure.
-- The payment_attempts table was exclusively used by the Cardcom integration.
-- General payment fields on orders (payment_status, payment_amount, etc.) are kept.

-- 1. Drop payment_attempts table (cascade drops trigger + indexes)
DROP TRIGGER IF EXISTS trg_payment_attempts_updated_at ON payment_attempts;
DROP FUNCTION IF EXISTS update_payment_attempts_updated_at();
DROP TABLE IF EXISTS payment_attempts;

-- 2. Drop Cardcom-specific invoice fields from orders
ALTER TABLE orders
  DROP COLUMN IF EXISTS invoice_number,
  DROP COLUMN IF EXISTS invoice_status;
