-- Add 'cancelled' to the allowed payment_status values.
-- The inline check constraint created in 00001 is named orders_payment_status_check.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'refunded', 'cancelled'));
