-- Migration 00029: Add 'queued' and 'rendering' statuses to film_scenes
--
-- The render flow now uses a queue model:
--   pending → queued → rendering → rendered
--                                 → error
--
-- Admin routes mark scenes as 'queued'. An external render worker picks them
-- up, sets 'rendering', and transitions to 'rendered' or 'error'.

ALTER TABLE public.film_scenes
  DROP CONSTRAINT IF EXISTS film_scenes_status_check;

ALTER TABLE public.film_scenes
  ADD CONSTRAINT film_scenes_status_check
    CHECK (status IN ('pending', 'queued', 'rendering', 'narration_ready', 'rendered', 'error'));
