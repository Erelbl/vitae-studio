create table public.photos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  original_storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes int not null,
  width int,
  height int,
  life_stage text not null default 'other'
    check (life_stage in (
      'baby', 'childhood', 'youth', 'military',
      'career', 'wedding', 'family', 'recent', 'other'
    )),
  display_order int not null default 0,
  caption text
);

create index idx_photos_order_id on public.photos(order_id);
