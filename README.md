# Atheneum Martial Arts — Member Portal

A member-centered web app for Atheneum Martial Arts (Medina, MN). When a member opens the app, it immediately shows what they need for their next successful training session.

Built with Next.js (App Router), TypeScript, Tailwind CSS, Prisma, and SQLite.

## Features (MVP vertical slice)

- **Sign in** as a member, parent, or coach (sample accounts below)
- **Member home** — next booked class, weekly training progress, recommended classes, announcements
- **Schedule & booking** — filter by program, beginner-friendly, or kids; book or cancel for yourself or your children; automatic waitlist when a class is full (with promotion when a spot opens)
- **Household profiles** — one parent account manages multiple child profiles; children are profiles under a guardian, never independent accounts
- **Coach tools** — today's classes, rosters, one-tap attendance check-in
- **Progress** — attendance history, weekly consistency vs. goal, coach-recorded milestones
- **Lead follow-up bot** (`/coach/leads`) — new leads are investigated and texted within 5 minutes, then followed up on a cadence until they reply

## Lead follow-up bot

Goal: never let a lead sit. Every lead — from a Facebook ad, the front desk, or an old spreadsheet
— is investigated, texted immediately, and followed up until they reply or ask to stop.

### How a lead moves through it

1. **Intake** — a Facebook Lead Ads webhook (`POST /api/webhooks/facebook`), the manual form at
   `/coach/leads/new`, or a pasted CSV at `/coach/leads/import`. Leads are deduplicated by phone
   number.
2. **Investigation** — the lead is scored 0–100 (hot/warm/cold) with a summary, what they actually
   want, likely objections, talking points, a recommended program, and a drafted opener. Uses an
   LLM when `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is set, otherwise a deterministic rules engine
   (recency, sign-up language, urgency, kid vs. adult, reply history).
3. **First text** — sent inline during intake, so a Facebook lead hears back in seconds. The
   dispatcher cron is the backstop that guarantees the 5-minute promise if that request failed.
4. **Cadence** — `NEW_LEAD` (5 texts over a week) or `REACTIVATION` for leads older than two weeks
   (4 texts over three weeks, opening with a new-intake angle instead of "thanks for enquiring").
   Templates and delays live in the database and are editable without a code change.
5. **Reply** — the inbound Twilio webhook records the text, cancels the queued drip so the bot
   can't talk over a live conversation, moves the lead to *replied*, re-investigates, and
   acknowledges instantly so the lead isn't left waiting.
6. **Stop conditions** — STOP/unsubscribe keywords, a coach marking *do not text*, or the lead
   being marked booked/won/lost. Automated texts are never sent during quiet hours (default
   9pm–8am studio time); they're rescheduled to the next allowed hour.

### Running the dispatcher

The dispatcher sends everything that's due. Run it every minute in production:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/follow-ups
# or, from a scheduler that prefers a command:
npm run bot:tick
```

Coaches can also hit **Run dispatcher now** on `/coach/leads`.

### Going live

Copy `.env.example` and fill in what you have — the bot runs fully without any of it, recording
texts against each lead (provider `MOCK`) instead of delivering them, which is how the flow is
demoed and tested.

| Integration | Variables | Wiring |
| --- | --- | --- |
| Twilio SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (or `TWILIO_MESSAGING_SERVICE_SID`) | Set the number's inbound webhook to `POST /api/webhooks/twilio/sms`; set `PUBLIC_BASE_URL` behind a proxy so signature validation works |
| Facebook Lead Ads | `FB_VERIFY_TOKEN`, `FB_APP_SECRET`, `FB_PAGE_ACCESS_TOKEN` | Subscribe the page's `leadgen` webhook to `/api/webhooks/facebook` (the `GET` handler answers Meta's verification challenge) |
| AI investigation | `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (optional `LLM_MODEL`) | Nothing to wire; falls back to the rules engine on any error |
| Dispatcher cron | `CRON_SECRET` | Schedule the `curl` above every minute |

Compliance notes: STOP keywords opt a number out permanently, opted-out leads can't be texted from
the UI, and quiet hours are enforced for automated sends. The studio is still responsible for
consent language on its lead forms.

All data is clearly-labeled sample data until Atheneum supplies the real schedule, roster, and brand assets.

## Getting started

```bash
npm install
cp .env.example .env   # then set a real SESSION_SECRET
npx prisma db push     # create the SQLite database
npx prisma db seed     # load sample data
npm run dev
```

Open http://localhost:3000.

### Sample accounts (password: `atheneum123`)

| Email | Role |
| --- | --- |
| member@example.com | Adult member |
| parent@example.com | Parent with two child profiles |
| coach@example.com | Coach (Today / roster / check-in tools) |
| admin@example.com | Admin (member management + coach tools) |

## Scripts

- `npm run dev` — dev server
- `npm run build` / `npm start` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript
- `npm run db:push` / `npm run db:seed` — database setup

## Deploying (Railway)

The repo includes `railway.json`. On Railway:

1. Create a service from this repo and attach a **volume** mounted at `/data`.
2. Set environment variables: `DATABASE_URL=file:/data/atheneum.db` and a random `SESSION_SECRET` (32+ chars).
3. Deploy — the start command (`npm run start:prod`) pushes the Prisma schema and seeds sample data only if the database is empty.

## Notes

- Business rules (programs, class templates, capacities, age groups, weekly goals) live in the database, not in code, so the real schedule can replace the sample data without code changes.
- No public rankings or leaderboards, per Atheneum's inclusive-culture guidance.
- Billing, e-commerce, and external scheduling integrations are intentionally out of scope until the academy's current systems are known.
