-- Migration 00023: Add story_evaluation JSONB column to orders
-- Stores the latest Claude-generated rhyme/quality evaluation for the order's story.
-- Written after generation and after "improve rhyme" passes.
-- No unique constraint needed — only one evaluation per order at a time (overwritten on each run).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS story_evaluation JSONB;

-- Notes:
-- Fields stored (by application):
--   rhyme_score         INT   1-10
--   hebrew_flow_score   INT   1-10
--   overall_story_score INT   1-10
--   evaluation_notes    TEXT  short notes in Hebrew
--   evaluated_at        TEXT  ISO timestamp
