-- Tracks the prompt, model, and generation parameters used for each AI call type.
-- One row per configuration version. When settings are changed, the old row gets
-- is_active = false and a new row is inserted. Every processing_job references
-- the generation_settings.id it was run with for full reproducibility.
create table public.generation_settings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  setting_type text not null
    check (setting_type in ('story', 'illustration', 'followup')),
  provider text not null,
  model_id text not null,
  system_prompt text,
  user_prompt_template text,
  temperature real,
  max_tokens int,
  extra_params jsonb,
  is_active boolean not null default true,
  notes text
);

-- order_id is nullable to allow global/default settings not tied to a specific order.
-- When order_id is null, it represents a default template; when set, it's an
-- order-specific override.

create index idx_generation_settings_order_id
  on public.generation_settings(order_id)
  where order_id is not null;

create index idx_generation_settings_active
  on public.generation_settings(setting_type, is_active)
  where order_id is null;
