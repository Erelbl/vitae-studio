-- Migration 00046: Add render progress tracking fields to film_scenes
--
-- render_stage:         machine-readable stage key (generating_video, rendering_scene,
--                       rendering_thumbnail, done, failed). NULL when idle.
-- render_progress_pct:  0–100 progress within the current render. 0 when idle/queued.
-- render_stage_message: human-readable Hebrew stage label shown in the admin UI.
--                       NULL when idle or after completion.
-- last_render_error:    last error message from a failed render. Persists across
--                       status changes so the admin can see why a re-queued scene
--                       previously failed. Cleared on successful completion.
ALTER TABLE public.film_scenes
  ADD COLUMN IF NOT EXISTS render_stage         TEXT,
  ADD COLUMN IF NOT EXISTS render_progress_pct  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS render_stage_message TEXT,
  ADD COLUMN IF NOT EXISTS last_render_error    TEXT;
