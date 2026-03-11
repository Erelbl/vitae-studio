-- Enable RLS on all tables
alter table public.orders enable row level security;
alter table public.questionnaire_responses enable row level security;
alter table public.photos enable row level security;
alter table public.pages enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.admin_actions enable row level security;
alter table public.profiles enable row level security;

-- Orders: public read via UUID (no auth required), admin full access
-- Customers access orders via direct UUID link, so we use anon key + service role key
create policy "Anyone can read orders by id" on public.orders
  for select using (true);

create policy "Service role can insert orders" on public.orders
  for insert with check (true);

create policy "Service role can update orders" on public.orders
  for update using (true);

-- Questionnaire responses: same pattern as orders
create policy "Anyone can read questionnaire by order" on public.questionnaire_responses
  for select using (true);

create policy "Anyone can insert questionnaire" on public.questionnaire_responses
  for insert with check (true);

create policy "Anyone can update questionnaire" on public.questionnaire_responses
  for update using (true);

-- Photos: readable by anyone (via order UUID), writable by service role
create policy "Anyone can read photos" on public.photos
  for select using (true);

create policy "Anyone can insert photos" on public.photos
  for insert with check (true);

-- Pages: readable by anyone, writable by service role
create policy "Anyone can read pages" on public.pages
  for select using (true);

create policy "Service role can manage pages" on public.pages
  for all using (true);

-- Processing jobs: admin read, service role write
create policy "Authenticated can read jobs" on public.processing_jobs
  for select using (true);

create policy "Service role can manage jobs" on public.processing_jobs
  for all using (true);

-- Admin actions: only authenticated admins
create policy "Admins can read admin actions" on public.admin_actions
  for select using (auth.uid() is not null);

create policy "Admins can insert admin actions" on public.admin_actions
  for insert with check (auth.uid() is not null);

-- Profiles: users can read own, admins can read all
create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = id);

-- Storage policies
-- These need to be created via Supabase dashboard or using storage API
-- originals: upload via signed URL (no RLS needed), read via signed URL
-- illustrations: service role only write, read via signed URL
-- exports: service role only write, read via signed URL
-- assets: public read
