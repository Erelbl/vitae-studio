-- Add decorative frame-style preset column to page_images.
-- Supported values: NULL (no mask), torn_top, torn_bottom, torn_left, torn_right.
-- Applied as CSS clip-path in browser rendering (preview + film).
-- Ignored by the PDF pipeline in MVP — @react-pdf/renderer does not support clip-path.

ALTER TABLE page_images
  ADD COLUMN IF NOT EXISTS frame_style TEXT NULL;

COMMENT ON COLUMN page_images.frame_style IS
  'Decorative mask preset: NULL=none | torn_top | torn_bottom | torn_left | torn_right. Applied via CSS clip-path.';
