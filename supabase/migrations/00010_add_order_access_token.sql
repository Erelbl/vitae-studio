-- Add secure preview link fields to orders.
-- access_token is a random hex string generated server-side, not a bare UUID.
-- access_token_expires_at defaults to 30 days from creation (set in application code).
alter table public.orders
  add column access_token text unique,
  add column access_token_expires_at timestamptz;

create index idx_orders_access_token on public.orders(access_token);
