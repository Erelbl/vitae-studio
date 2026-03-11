create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  page_id uuid references public.pages(id) on delete cascade,
  created_at timestamptz not null default now(),
  admin_user_id uuid not null references auth.users(id),
  action_type text not null
    check (action_type in (
      'approve', 'reject', 'edit_text', 'regenerate_text',
      'regenerate_illustration', 'export_pdf', 'mark_paid',
      'mark_delivered', 'add_note'
    )),
  details jsonb
);

create index idx_admin_actions_order_id on public.admin_actions(order_id);
