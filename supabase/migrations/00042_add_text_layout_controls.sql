-- Add line spacing, text box width, and page background color controls to the album editor.
-- All columns are nullable: null = use the rendering default.

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS line_height    NUMERIC,   -- line-height multiplier (e.g. 1.0–2.5), null = default (1.4)
  ADD COLUMN IF NOT EXISTS text_width_pct INTEGER,   -- text box width as % of page (30–100), null = layout default
  ADD COLUMN IF NOT EXISTS bg_color       TEXT;      -- page background hex color (e.g. '#FAF8F2'), null = layout default
