-- PartySecurity schema.
-- Paste this into the Supabase SQL editor (Project -> SQL -> New query) and run it once.

-- 1. The single tickets table.
create table if not exists public.tickets (
  id              uuid primary key default gen_random_uuid(),
  buyer_name      text not null,
  buyer_contact   text,
  is_in           boolean not null default false,
  last_change_at  timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists tickets_is_in_idx on public.tickets (is_in);

-- 2. Row Level Security: lock the table down.
alter table public.tickets enable row level security;

-- Admin (any authenticated user) gets full access. Single-organizer model -
-- only create auth users you trust to administer the event.
drop policy if exists "admin full access" on public.tickets;
create policy "admin full access"
  on public.tickets
  for all
  to authenticated
  using (true)
  with check (true);

-- Anonymous (the bouncer's browser, no login) gets NO direct table access.
-- All bouncer interaction goes through the two RPCs below, which run with
-- security definer so they can read/write the table on the caller's behalf
-- while only exposing the minimal data the bouncer UI needs.

-- 3. Lookup RPC: returns the ticket state for the confirmation screen.
create or replace function public.lookup_ticket(ticket_id uuid)
returns table (id uuid, buyer_name text, is_in boolean)
language sql
security definer
set search_path = public
as $$
  select t.id, t.buyer_name, t.is_in
    from public.tickets t
   where t.id = ticket_id;
$$;

-- 4. Toggle RPC: atomically flip in/out state, but only if the DB still
-- matches the state the bouncer saw on screen. Returns zero rows if another
-- bouncer flipped it first (the UI then re-fetches and shows the new state).
create or replace function public.toggle_ticket(ticket_id uuid, expected_state boolean)
returns table (id uuid, buyer_name text, is_in boolean)
language sql
security definer
set search_path = public
as $$
  update public.tickets
     set is_in = not expected_state,
         last_change_at = now()
   where id = ticket_id
     and is_in = expected_state
  returning id, buyer_name, is_in;
$$;

-- 5. Grant execute on the RPCs to the anonymous role used by the bouncer page.
grant execute on function public.lookup_ticket(uuid) to anon;
grant execute on function public.toggle_ticket(uuid, boolean) to anon;
grant execute on function public.lookup_ticket(uuid) to authenticated;
grant execute on function public.toggle_ticket(uuid, boolean) to authenticated;

-- 6. Bouncer passcode gate.
-- A simple key/value settings table. The passcode value is never exposed to
-- the anon (bouncer) client directly; bouncers validate by calling the
-- check_passcode RPC, which returns only true/false.
create table if not exists public.settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

alter table public.settings enable row level security;

-- Admin can read and edit settings (e.g. from the Supabase Table Editor).
drop policy if exists "admin manage settings" on public.settings;
create policy "admin manage settings"
  on public.settings
  for all
  to authenticated
  using (true)
  with check (true);

-- Seed a default passcode. Change it via the Supabase Table Editor any time.
insert into public.settings (key, value)
  values ('bouncer_passcode', 'changeme')
  on conflict (key) do nothing;

-- 7. check_passcode RPC: returns true if the given string matches the stored
-- bouncer passcode. Anon-callable. Never returns the passcode itself.
create or replace function public.check_passcode(passcode text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.settings
     where key = 'bouncer_passcode'
       and value = passcode
  );
$$;

grant execute on function public.check_passcode(text) to anon;
grant execute on function public.check_passcode(text) to authenticated;
