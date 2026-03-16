-- Add story_source to orders: 'questionnaire' (default) or 'manual'
-- When 'manual', the admin writes spread content directly.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS story_source TEXT NOT NULL DEFAULT 'questionnaire';

ALTER TABLE orders ADD CONSTRAINT orders_story_source_check
  CHECK (story_source IN ('questionnaire', 'manual'));

-- JSONB column storing manual spread content.
-- Shape: [{ id, spreadIndex, rightPageText, leftPageText, isActive }]
-- Only meaningful when story_source = 'manual'.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS manual_spreads_json JSONB;
