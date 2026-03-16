-- Add album_type to orders (single / couple / memorial)
-- This determines which questionnaire schema loads for the order.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS album_type TEXT NOT NULL DEFAULT 'single';

ALTER TABLE orders ADD CONSTRAINT orders_album_type_check
  CHECK (album_type IN ('single', 'couple', 'memorial'));
