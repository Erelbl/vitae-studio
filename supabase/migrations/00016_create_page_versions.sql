-- Stores every past version of a page's text or illustration.
-- Created on: initial generation, regeneration, or admin text edit.
-- The current active version is tracked by pages.text_version / pages.illustration_version.
-- Admin can restore a prior version by copying its content back to the pages row
-- and recording a restore action in admin_actions.
create table public.page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  created_at timestamptz not null default now(),
  version_type text not null check (version_type in ('text', 'illustration')),
  version_number int not null,
  -- For text versions: the text content itself.
  -- For illustration versions: the storage path (e.g. originals/{order_id}/{page_id}/v2.png).
  content text not null,
  -- Full snapshot of the settings and input used to produce this version.
  -- Null for admin-authored text edits.
  generation_settings_id uuid references public.generation_settings(id),
  input_snapshot jsonb,
  output_metadata jsonb,
  -- How this version was created.
  created_by text not null
    check (created_by in ('generation', 'admin_edit', 'restore')),
  constraint page_versions_unique unique (page_id, version_type, version_number)
);

create index idx_page_versions_page_id on public.page_versions(page_id, version_type);
