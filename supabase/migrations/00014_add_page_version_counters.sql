-- Add version counters to pages.
-- These increment each time text or illustration is regenerated,
-- and are used to name versioned storage paths (v1.png, v2.png, ...).
alter table public.pages
  add column text_version int not null default 1,
  add column illustration_version int not null default 1;
