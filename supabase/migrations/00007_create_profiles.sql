create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  display_name text,
  created_at timestamptz not null default now()
);

-- Auto-create profile when a new auth user is created
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
