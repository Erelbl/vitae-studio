-- Migration 00024: Add manual_image_path to page_images
-- Allows admins to upload a custom image directly to any page slot,
-- without needing a photo/illustration in the photos table.
--
-- Resolution priority in application code:
--   1. manual_image_path (if set) → signed URL from illustrations bucket
--   2. photo_id → resolved via photos.illustration_storage_path
--
-- Cleared to NULL when a photo is assigned to the same slot via PUT /images.
-- Storage path convention: {orderId}/manual/{pageId}-slot{slot}.{ext}

ALTER TABLE public.page_images
  ADD COLUMN IF NOT EXISTS manual_image_path TEXT;
