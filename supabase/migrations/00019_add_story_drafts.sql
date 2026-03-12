-- Each complete story generation run creates one story_drafts row.
-- Pages are linked to their draft via story_draft_id.
-- Existing pages (story_draft_id IS NULL) continue to work — they are treated
-- as legacy data with no associated draft.

create table public.story_drafts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  version_number integer not null,
  created_at timestamptz not null default now(),
  generation_settings_id uuid references public.generation_settings(id),
  constraint story_drafts_order_version_unique unique (order_id, version_number)
);

create index idx_story_drafts_order_id on public.story_drafts(order_id, created_at desc);

-- Link pages to a specific draft (nullable: pre-existing pages have no draft row)
alter table public.pages
  add column story_draft_id uuid references public.story_drafts(id) on delete set null;

create index idx_pages_story_draft_id on public.pages(story_draft_id);
