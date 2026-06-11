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

-- 4. Toggle RPC: atomically flip in/out state. Requires the bouncer passcode
-- so a ticket holder who knows their own UUID cannot flip themselves back to
-- OUTSIDE and reuse the code. Only updates if the DB still matches the state
-- the bouncer saw on screen; returns zero rows if another bouncer flipped it
-- first (the UI then re-fetches and shows the new state). Raises an exception
-- for a bad passcode so the UI can re-prompt.

-- Drop the old passcode-less signature so anon can no longer call it.
drop function if exists public.toggle_ticket(uuid, boolean);

create or replace function public.toggle_ticket(ticket_id uuid, expected_state boolean, passcode text)
returns table (id uuid, buyer_name text, is_in boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.settings s
     where s.key = 'bouncer_passcode'
       and s.value = passcode
  ) then
    raise exception 'invalid passcode';
  end if;

  return query
  update public.tickets t
     set is_in = not expected_state,
         last_change_at = now()
   where t.id = ticket_id
     and t.is_in = expected_state
  returning t.id, t.buyer_name, t.is_in;
end;
$$;

-- 5. Grant execute on the RPCs to the anonymous role used by the bouncer page.
grant execute on function public.lookup_ticket(uuid) to anon;
grant execute on function public.toggle_ticket(uuid, boolean, text) to anon;
grant execute on function public.lookup_ticket(uuid) to authenticated;
grant execute on function public.toggle_ticket(uuid, boolean, text) to authenticated;

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
-- The short sleep slows online brute-force attempts against the passcode.
create or replace function public.check_passcode(passcode text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_sleep(0.4);
  return exists (
    select 1
      from public.settings
     where key = 'bouncer_passcode'
       and value = passcode
  );
end;
$$;

grant execute on function public.check_passcode(text) to anon;
grant execute on function public.check_passcode(text) to authenticated;
