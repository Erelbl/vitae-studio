-- Migration 00028: Text style controls
-- Adds font_size_px (numeric font size), text_align, and free text position (text_x, text_y)
-- to the pages table for the album page editor.

-- 1. Numeric font size — overrides text_size enum when set
ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS font_size_px SMALLINT;

-- 2. Text alignment — 'left', 'center', 'right'; defaults to 'center'
ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS text_align TEXT DEFAULT 'center';

ALTER TABLE public.pages
  DROP CONSTRAINT IF EXISTS pages_text_align_check;

ALTER TABLE public.pages
  ADD CONSTRAINT pages_text_align_check
  CHECK (text_align IS NULL OR text_align IN ('left', 'center', 'right'));

-- 3. Free text position — 0–1 normalised coordinates for draggable text overlay
--    NULL means use the layout-default position (gradient bottom/top/center).
ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS text_x FLOAT;

ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS text_y FLOAT;
