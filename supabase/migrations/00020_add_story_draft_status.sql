-- Add status tracking to story_drafts so the admin UI can show generation progress
-- and detect failures without waiting for a synchronous response.

alter table public.story_drafts
  add column status text not null default 'completed'
    check (status in ('generating', 'completed', 'failed')),
  add column error_message text;

-- Backfill existing rows (all were created after successful generation, so they are completed)
update public.story_drafts set status = 'completed' where status = 'completed';

create index idx_story_drafts_status on public.story_drafts(status) where status = 'generating';
