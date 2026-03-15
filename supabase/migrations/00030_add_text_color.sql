-- Migration 00030: Add text_color to pages
-- Allows admin to choose text color (white or black) per page.
-- Default is NULL — overlay layouts default to white, split layouts to foreground color.

ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS text_color TEXT DEFAULT NULL;

ALTER TABLE public.pages
  DROP CONSTRAINT IF EXISTS pages_text_color_check;

ALTER TABLE public.pages
  ADD CONSTRAINT pages_text_color_check
  CHECK (text_color IS NULL OR text_color IN ('white', 'black'));
