-- Migration 00025: Add film_projects and film_scenes tables
-- Foundation tables for the Film product (page-turn video with AI narration).
-- No rendering pipeline yet — only the data model.

-- ── film_projects ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.film_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scenes_built', 'narration_pending', 'narration_ready',
                       'rendering', 'rendered', 'assembled', 'error')),

  -- Voice / narration
  narration_mode TEXT NOT NULL DEFAULT 'ai'
    CHECK (narration_mode IN ('ai', 'manual', 'none')),
  selected_voice_id TEXT,
  voice_choice_status TEXT DEFAULT 'pending'
    CHECK (voice_choice_status IN ('pending', 'samples_ready', 'chosen')),
  voice_sample_a_path TEXT,
  voice_sample_b_path TEXT,
  voice_sample_a_voice_id TEXT,
  voice_sample_b_voice_id TEXT,

  -- Motion / music
  motion_style TEXT NOT NULL DEFAULT 'gentle'
    CHECK (motion_style IN ('gentle', 'dynamic', 'none')),
  music_enabled BOOLEAN NOT NULL DEFAULT false,
  music_track_path TEXT,

  -- Output
  final_video_path TEXT,
  final_video_thumbnail_path TEXT,
  final_duration_seconds REAL,

  -- Render tracking
  last_assembled_at TIMESTAMPTZ,
  last_rendered_at TIMESTAMPTZ,
  render_version INT NOT NULL DEFAULT 0,

  -- Error
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One film project per order (for now)
CREATE UNIQUE INDEX IF NOT EXISTS film_projects_order_id_idx ON public.film_projects(order_id);

-- ── film_scenes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.film_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  film_project_id UUID NOT NULL REFERENCES public.film_projects(id) ON DELETE CASCADE,

  -- Page mapping
  page_spread_key TEXT,           -- e.g. "spread_01", "cover"
  page_ids_json JSONB,            -- array of page UUIDs in this scene
  scene_order INT NOT NULL,

  -- Content
  title TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'narration_ready', 'rendered', 'error')),
  source_text TEXT,               -- original album text for this scene
  narration_text TEXT,            -- adjusted text for narration (may differ from album text)

  -- Voice
  voice_id TEXT,

  -- Motion / transitions
  motion_preset TEXT DEFAULT 'ken_burns',
  transition_in TEXT DEFAULT 'fade',
  transition_out TEXT DEFAULT 'fade',

  -- Timing
  duration_ms INT,
  audio_duration_ms INT,

  -- Generated assets
  audio_path TEXT,
  rendered_scene_path TEXT,
  thumbnail_path TEXT,

  -- Render tracking
  render_hash TEXT,               -- hash of inputs to detect when re-render needed
  version INT NOT NULL DEFAULT 1,

  -- Error
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS film_scenes_project_id_idx ON public.film_scenes(film_project_id);
CREATE INDEX IF NOT EXISTS film_scenes_order_idx ON public.film_scenes(film_project_id, scene_order);
