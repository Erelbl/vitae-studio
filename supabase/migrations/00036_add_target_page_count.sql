-- Add target_page_count: admin-controlled desired album length.
-- Even integer, 20–40, default 40 (matching current default total_pages).
-- total_pages remains the actual page count after generation/apply.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS target_page_count INT NOT NULL DEFAULT 40;

ALTER TABLE orders ADD CONSTRAINT orders_target_page_count_range
  CHECK (target_page_count >= 20 AND target_page_count <= 40);

ALTER TABLE orders ADD CONSTRAINT orders_target_page_count_even
  CHECK (target_page_count % 2 = 0);
