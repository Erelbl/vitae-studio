-- Migration 00047: Add render job type and video target to film_scenes
--
-- render_job_type:     defines what the worker should do when it picks up the scene.
--                      'full_render'           — run the existing full render flow (default).
--                      'regenerate_video_only' — clear the requested Kling path(s) and
--                                                re-render. Does NOT skip the Remotion render
--                                                step — it still produces a fresh scene MP4.
--
-- render_video_target: which Kling video asset(s) to regenerate.
--                      Only meaningful when render_job_type = 'regenerate_video_only'.
--                      'right'   — right-page video only  (right_page_video_path)
--                      'left'    — left-page video only   (left_page_video_path)
--                      'both'    — both per-page videos   (right + left)
--                      'spread'  — unified spread video   (spread_video_path)
ALTER TABLE public.film_scenes
  ADD COLUMN IF NOT EXISTS render_job_type     TEXT NOT NULL DEFAULT 'full_render',
  ADD COLUMN IF NOT EXISTS render_video_target TEXT;
