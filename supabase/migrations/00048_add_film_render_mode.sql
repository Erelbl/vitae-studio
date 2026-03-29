-- Migration 00048: Add render_mode to film_projects
--
-- Stores the assembly quality mode selected by the admin when queuing
-- final film assembly. The render worker reads this field when assembling.
--
-- Values: 'preview' (default, 960x540, CRF 24) | 'final' (1920x1080, CRF 22)

ALTER TABLE public.film_projects
  ADD COLUMN IF NOT EXISTS render_mode TEXT NOT NULL DEFAULT 'preview';
