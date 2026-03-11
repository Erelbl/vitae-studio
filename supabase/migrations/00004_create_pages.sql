create table public.pages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  page_number int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  photo_id uuid references public.photos(id) on delete set null,
  text_content text,
  text_status text not null default 'pending'
    check (text_status in ('pending', 'generating', 'ready', 'approved')),
  illustration_storage_path text,
  illustration_status text not null default 'pending'
    check (illustration_status in ('pending', 'generating', 'ready', 'failed', 'approved')),
  illustration_prompt text,
  illustration_model text,
  text_generation_model text,
  admin_text_override boolean not null default false,
  page_type text not null default 'illustration_and_text'
    check (page_type in (
      'illustration_and_text', 'text_only', 'cover', 'dedication', 'back_cover'
    )),
  -- Future video fields
  narration_audio_path text,
  narration_duration_ms int,
  transition_type text not null default 'fade',
  display_duration_ms int not null default 5000,

  constraint pages_order_page_unique unique (order_id, page_number)
);

create trigger pages_updated_at
  before update on public.pages
  for each row execute function public.update_updated_at();

create index idx_pages_order_id on public.pages(order_id);
