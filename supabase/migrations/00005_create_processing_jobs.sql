create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  page_id uuid references public.pages(id) on delete cascade,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  job_type text not null
    check (job_type in (
      'generate_story', 'generate_page_text',
      'generate_illustration', 'generate_pdf'
    )),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'retrying')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  error_message text,
  input_data jsonb,
  output_data jsonb,
  priority int not null default 0
);

create index idx_processing_jobs_status on public.processing_jobs(status, created_at);
create index idx_processing_jobs_order_id on public.processing_jobs(order_id);
