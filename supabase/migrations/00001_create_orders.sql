create table public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'created'
    check (status in (
      'created', 'questionnaire_complete', 'photos_uploaded',
      'generating_text', 'text_ready', 'generating_illustrations',
      'preview_ready', 'admin_review', 'approved', 'revision_requested',
      'generating_pdf', 'delivered', 'error_generation'
    )),
  person_name text not null,
  person_gender text not null check (person_gender in ('male', 'female')),
  person_birth_date date,
  buyer_name text not null default '',
  buyer_email text not null default '',
  buyer_phone text not null default '',
  occasion text,
  language text not null default 'he',
  total_pages int not null default 40,
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'refunded')),
  payment_amount int,
  payment_method text,
  payment_date timestamptz,
  admin_notes text,
  customer_notes text,
  pdf_storage_path text,
  delivered_at timestamptz,
  video_storage_path text,
  video_status text
);

-- Auto-update updated_at
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.update_updated_at();

create index idx_orders_status on public.orders(status);
create index idx_orders_created_at on public.orders(created_at desc);
