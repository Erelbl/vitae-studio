-- Add white-background-removed illustration path to photos.
-- illustration_nobg_path: storage path for the transparent-PNG version (null = not yet generated).
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS illustration_nobg_path TEXT;

-- Add per-slot flag to page_images: whether to use the no-background version.
-- Defaults to FALSE so existing rows keep the original illustration.
ALTER TABLE page_images
  ADD COLUMN IF NOT EXISTS use_nobg BOOLEAN NOT NULL DEFAULT FALSE;
