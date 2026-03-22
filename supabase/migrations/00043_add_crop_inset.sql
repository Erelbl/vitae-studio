-- Non-destructive crop for page_images slots.
-- Stored as inset fractions (0.0–0.9) of the slot container from each side.
-- Rendered as CSS clip-path: inset(top right bottom left) — no image data is modified.
-- All default to 0 (no crop applied). Existing rows are unchanged.

ALTER TABLE page_images
  ADD COLUMN crop_inset_top    FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN crop_inset_right  FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN crop_inset_bottom FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN crop_inset_left   FLOAT NOT NULL DEFAULT 0;
