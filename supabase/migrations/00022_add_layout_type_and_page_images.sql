-- Migration 00022: Add layout_type to pages + create page_images table
-- Safe to run on existing data: layout_type defaults to FULL_IMAGE (preserves current behavior)

-- 1. Add layout_type column (non-breaking: existing rows get default FULL_IMAGE)
ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS layout_type TEXT NOT NULL DEFAULT 'FULL_IMAGE';

-- Add check constraint separately so IF NOT EXISTS pattern works
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
    'TWO_IMAGES'
  ));

-- 2. Create page_images table (slot-based image assignment per page)
CREATE TABLE IF NOT EXISTS public.page_images (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    UUID        NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  photo_id   UUID        REFERENCES public.photos(id) ON DELETE SET NULL,
  slot       INTEGER     NOT NULL CHECK (slot IN (1, 2)),
  crop_x     FLOAT       NOT NULL DEFAULT 0,
  crop_y     FLOAT       NOT NULL DEFAULT 0,
  scale      FLOAT       NOT NULL DEFAULT 1 CHECK (scale >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One image per slot per page
  CONSTRAINT page_images_page_slot_unique UNIQUE (page_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_page_images_page_id
  ON public.page_images(page_id);

-- 3. RLS (service role bypasses RLS, but add for completeness)
ALTER TABLE public.page_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to page_images"
  ON public.page_images
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Notes:
-- pages.photo_id is NOT dropped (backward compatibility)
-- pages.illustration_storage_path is NOT dropped (used as slot-1 fallback in preview)
-- New rows in page_images take priority over legacy pages.illustration_storage_path
