create table public.questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responses jsonb not null default '{}',
  is_complete boolean not null default false
);

create trigger questionnaire_responses_updated_at
  before update on public.questionnaire_responses
  for each row execute function public.update_updated_at();
