# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PartySecurity is a party entrance verification system. Each paying guest gets a ticket link (`/t/<uuid>`) sent via WhatsApp that renders a Data Matrix barcode encoding the ticket UUID. At the entrance, a bouncer scans the barcode with their phone's browser; the system toggles the guest's IN/OUT state in the database so a code can't be shared or reused.

**No app install required for attendees** — they only need WhatsApp to receive the ticket link.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — typecheck (tsc) + production build to `dist/`

Stack: Vite + React + TypeScript + Tailwind, Supabase (Postgres + auth + realtime). Deployed as a static SPA (`vercel.json` / `wrangler.jsonc` both present). Env vars in `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (see `.env.example`).

## Architecture

Routes (`src/App.tsx`):
- `/` and `/scan` — bouncer scanner (`src/pages/Scan.tsx`), wrapped in `BouncerGate` (passcode prompt)
- `/admin` — organizer dashboard (`src/pages/Admin.tsx`), Supabase email/password auth
- `/t/:id` — guest ticket page (`src/pages/TicketView.tsx`), public, renders the barcode

Database (`supabase/schema.sql` — paste into the Supabase SQL editor to apply; written to be safely re-runnable):
- `tickets` table: `id` (uuid), `buyer_name`, `buyer_contact`, `is_in` (boolean IN/OUT state), `last_change_at`. NOT a one-shot `isUsed` flag — bouncers toggle people in AND out so re-entry works.
- `settings` table: key/value, holds `bouncer_passcode`.
- RLS: `authenticated` (admin) has full table access; `anon` has NO direct table access and goes through `security definer` RPCs only.

RPCs (the security boundary — anon-callable):
- `lookup_ticket(ticket_id)` — returns id, buyer_name, is_in. Public; used by scan confirm screen and ticket page.
- `toggle_ticket(ticket_id, expected_state, passcode)` — flips IN/OUT **only if** the bouncer passcode matches (raises `invalid passcode` otherwise) and the row still matches `expected_state` (optimistic concurrency; zero rows = another bouncer got there first, UI re-fetches).
- `check_passcode(passcode)` — true/false, sleeps 0.4s to slow brute force.

## Security model (do not regress)

- The Supabase anon key ships in the bundle by design; all real security lives in RLS + the RPC signatures above.
- `toggle_ticket` MUST require the passcode server-side. A passcode-less toggle lets a guest who knows their own UUID (it's in their ticket link) flip themselves back to OUT and reuse the code.
- The bouncer device stores the passcode itself in localStorage (`src/lib/passcode.ts`) and sends it with every toggle — never a "passed the gate" boolean. Rotating the passcode in the `settings` table therefore revokes all devices.
- Supabase dashboard config (not in code): public signups are DISABLED — any authenticated user has full admin access via RLS, so self-signup would mean instant admin.
- Schema changes to RPC signatures break the deployed client until it's redeployed — apply schema + deploy together.

## Conventions

- Bouncer-facing UI is Hebrew-friendly (WhatsApp message text is Hebrew, RTL ok); phone numbers normalized to Israeli international format (`972…`) in `Admin.tsx`.
- Admin state updates pair an optimistic local `setTickets` update with a Supabase realtime subscription on the `tickets` table.
