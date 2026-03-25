-- Migration 00044: Add per-page Kling video storage paths to film_scenes
--
-- right_page_video_path / left_page_video_path store paths inside the
-- films/ Supabase bucket for Kling-generated page MP4s.
-- NULL = no Kling video generated yet → Remotion CSS-motion fallback is used.
ALTER TABLE public.film_scenes
  ADD COLUMN IF NOT EXISTS right_page_video_path TEXT,
  ADD COLUMN IF NOT EXISTS left_page_video_path  TEXT;
