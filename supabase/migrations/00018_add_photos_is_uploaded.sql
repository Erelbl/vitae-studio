-- Track whether a customer has completed the direct-to-storage upload.
-- The POST /photos route creates the record and returns a signed URL.
-- The client sets is_uploaded = true via PATCH /photos/[photoId] after the
-- upload completes. Only is_uploaded = true photos are included in generation.

alter table public.photos
  add column is_uploaded boolean not null default false;

create index idx_photos_order_uploaded on public.photos(order_id, is_uploaded);
