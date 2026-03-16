-- Migration 00031: Add scene_overrides_json to film_scenes
-- Stores per-scene pronunciation overrides applied at TTS generation time.
-- Scene-level overrides take precedence over project-level (film_projects.tts_overrides_json)
-- for the same `original` key. Both sets are merged before applying to TTS text.
-- Does NOT affect album text shown to the customer.
-- Shape: [{ "original": "שם", "spoken": "phonetic" }, ...]

ALTER TABLE public.film_scenes
  ADD COLUMN IF NOT EXISTS scene_overrides_json JSONB DEFAULT NULL;
