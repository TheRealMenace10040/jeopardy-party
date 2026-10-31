# Jeopardy Party

A party-friendly Jeopardy-style game. The host runs the game from a phone or tablet, the board shows on a TV, and up to six teams buzz in on their phones. Players never sign in; hosts sign in with Google to save their boards.

Full design: [docs/design-spec.md](docs/design-spec.md). Running a party: [docs/event-day.md](docs/event-day.md).

## How a game works

1. Host signs in at `/host`, builds a board (or adds the tester game) and presses **Play**.
2. The TV opens `/tv` and enters the 4-character room code (or the host clicks **Open TV view here** on a laptop plugged into the TV).
3. Teams scan the QR code on the TV, or go to `/join` and enter the code.
4. The host picks clues, opens the buzzers, and judges spoken answers. Final Jeopardy wagers and responses are typed privately on phones.

## Tech stack

- React 18 + TypeScript + Vite, React Router
- Supabase: Postgres (games, rooms, teams), Storage (private `clue-images` bucket), Auth (Google), Realtime (broadcast from database)
- Hosted on Vercel; `vercel.json` rewrites all routes to the SPA

### How the live game stays fair and in sync

- Room state lives in `rooms.state` (public data only). Every change is pushed to `room-<CODE>` via a database trigger (`realtime.send`).
- The host's device applies game rules (`src/lib/engine.ts`) with optimistic concurrency on `rooms.version`.
- Players act only through `SECURITY DEFINER` functions (`join_room`, `buzz`, `dd_wager`, `final_wager`, `final_response`) authorised by a per-team token. The first buzz is decided inside the database, so phone clocks and network lag on the TV don't matter.
- Correct responses and Daily Double positions never leave the host's account until revealed.

## Run locally

```bash
npm install
npm run dev
```

Opens on http://localhost:5221. For Google sign-in to return to localhost, `http://localhost:5221/**` must be in Supabase → Authentication → URL Configuration → Redirect URLs.

## Configuration

`.env.local` (both values are public by design):

```
VITE_SUPABASE_URL=https://niizscsrpuxtmtynfmvz.supabase.co
VITE_SUPABASE_KEY=sb_publishable_...
```

Supabase project: `jeopardy-party` (`niizscsrpuxtmtynfmvz`, us-east-1, free plan). Schema: `supabase/migrations/001_init.sql`.

Google OAuth client: Google Cloud project `jeopardy-513301`, redirect URI `https://niizscsrpuxtmtynfmvz.supabase.co/auth/v1/callback`.

## Keep-alive

`.github/workflows/keep-alive.yml` pings the database twice a week so the free Supabase project doesn't pause.

## Deployment

Live: **https://jeopardy-party-five.vercel.app** (Vercel project `the-real-menace/jeopardy-party`).

- Host: `/host` · TV: `/tv` · Players: `/join`
- Deploy: `npx vercel deploy --prod` from the project folder. The two `VITE_SUPABASE_*` values are set as Vercel production environment variables.
- Supabase Auth → URL Configuration: Site URL is the live address; redirect URLs allow the live address and `http://localhost:5221/**`.
