-- Migration 00027: Editor improvements
-- 1) Add text_size column to pages (nullable, sm/md/lg/xl)
-- 2) Extend layout_type check constraint with new layout variants

-- 1. text_size: controls displayed font size of page text in the album
ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS text_size TEXT DEFAULT 'md';

ALTER TABLE public.pages
  DROP CONSTRAINT IF EXISTS pages_text_size_check;

ALTER TABLE public.pages
  ADD CONSTRAINT pages_text_size_check
  CHECK (text_size IS NULL OR text_size IN ('sm', 'md', 'lg', 'xl'));

-- 2. Extend allowed layout_type values (drop + recreate; existing rows are unaffected)
ALTER TABLE public.pages
  DROP CONSTRAINT IF EXISTS pages_layout_type_check;

ALTER TABLE public.pages
  ADD CONSTRAINT pages_layout_type_check
  CHECK (layout_type IN (
    'FULL_IMAGE',
    'TEXT_ONLY',
    'IMAGE_TOP_TEXT_BOTTOM',
    'TEXT_TOP_IMAGE_BOTTOM',
    'IMAGE_LEFT_TEXT_RIGHT',
    'IMAGE_RIGHT_TEXT_LEFT',
    'TWO_IMAGES',
    'FULL_IMAGE_TEXT_TOP',
    'FULL_IMAGE_TEXT_CENTER'
  ));
