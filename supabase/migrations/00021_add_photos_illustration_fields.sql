-- Add illustration generation fields to photos table.
-- These track the watercolor illustration generated from each uploaded photo.
-- Generation happens at the photo level (MVP), not yet mapped to album pages.

alter table public.photos
  add column if not exists illustration_storage_path    text,
  add column if not exists illustration_status          text
    check (illustration_status in ('generating', 'completed', 'failed')),
  add column if not exists illustration_model           text,
  add column if not exists illustration_generated_at    timestamptz,
  add column if not exists illustration_error           text;

comment on column public.photos.illustration_storage_path  is 'Storage path in the illustrations bucket, e.g. {order_id}/{photo_id}.png';
comment on column public.photos.illustration_status        is 'generating | completed | failed (null = not yet requested)';
comment on column public.photos.illustration_model         is 'Model identifier used for this illustration';
comment on column public.photos.illustration_generated_at  is 'Timestamp when generation completed successfully';
comment on column public.photos.illustration_error         is 'Error message if generation failed';
