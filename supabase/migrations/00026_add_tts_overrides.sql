-- Migration 00026: Add tts_overrides_json to film_projects
-- Stores per-film pronunciation overrides applied only at TTS generation time.
-- Does NOT affect album text shown to the customer.
-- Shape: [{ "original": "בארי", "spoken": "בְּאֵרִי" }, ...]

ALTER TABLE public.film_projects
  ADD COLUMN IF NOT EXISTS tts_overrides_json JSONB;
