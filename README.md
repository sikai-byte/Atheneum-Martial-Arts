# Atheneum Martial Arts — Member Portal

A member-centered web app for Atheneum Martial Arts (Medina, MN). When a member opens the app, it immediately shows what they need for their next successful training session.

Built with Next.js (App Router), TypeScript, Tailwind CSS, Prisma, and PostgreSQL.

## Features (MVP vertical slice)

- **Sign in** as a member, parent, or coach (sample accounts below)
- **Member home** — next booked class, weekly training progress, recommended classes, announcements
- **Schedule & booking** — filter by program, beginner-friendly, or kids; book or cancel for yourself or your children; automatic waitlist when a class is full (with promotion when a spot opens)
- **Household profiles** — one parent account manages multiple child profiles; children are profiles under a guardian, never independent accounts
- **Coach tools** — today's classes, rosters, one-tap attendance check-in
- **Progress** — attendance history, weekly consistency vs. goal, coach-recorded milestones
- **Lead follow-up bot** (`/coach/leads`) — new leads are investigated and texted within 5 minutes, then followed up on a cadence until they reply
- **Sales agent** — once a lead replies, an LLM agent holds the conversation from a verified knowledge base, proposes a real class time, books the trial, and nurtures members after they join
- **Members & dues** (`/coach/members`) — sign a lead up as a member in one step, record dues and one-off payments, track past-due cards
- **Growth** (`/coach/growth`) — leads → members → revenue per source and campaign, and lifetime value per member

## Scope in one paragraph

One database holds the whole funnel: a lead arrives (Facebook ad, front desk, old CSV), gets
investigated and texted inside five minutes, is carried through a real conversation by the sales
agent until a trial is booked, converts into a member with dues and payments attached, and every
dollar stays credited to the ad or campaign that produced them. It is intended to replace the
studio's reliance on Gymnetics/GoHighLevel, and shares its Postgres database with the member
portal in the same app.

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
5. **Reply** — the inbound webhook (HighLevel or Twilio) records the text, cancels the queued drip so the bot
   can't talk over a live conversation, moves the lead to *replied*, re-investigates, and
   acknowledges instantly so the lead isn't left waiting.
6. **Stop conditions** — STOP/unsubscribe keywords, a coach marking *do not text*, or the lead
   being marked booked/won/lost. Automated texts are never sent during quiet hours (default
   9pm–8am studio time); they're rescheduled to the next allowed hour.

## Sales agent

The cadence above is templates; the agent is the conversation. When a lead replies, the agent
drafts the next message from studio facts, and staff approve it at `/coach/leads/<id>` (default
`BotConfig.agentMode = "DRAFT"`; `AUTOPILOT` sends without review).

What grounds it, and why each piece exists:

- **Knowledge base** (`KnowledgeItem`, editable at `/coach/leads/knowledge`) — programs, audiences,
  pricing, objections, upsell paths. The agent answers only from these facts and hands off when a
  needed one is missing, so it cannot invent a price or a policy.
- **Real schedule only** — `upcomingClasses()` loads scheduled *future* `ClassSession` rows for the
  lead's age group, excluding Private Training. With nothing loaded the agent refuses to name a day
  or time. `ensureUpcomingSessions()` rolls the timetable forward on each dispatcher tick.
- **A proposal is not a booking** — the model may return a `sessionId`, but it is discarded unless
  it was one actually offered to the model *and* the lead's last inbound message accepts it;
  `bookTrial()` then re-checks the session is scheduled and in the future. So "how about Monday
  6:15?" never creates a `TrialBooking` on its own.
- **Money is a human's job** — price haggling, and any children's rate (which depends on days per
  week), are detected after generation and forced to `HANDOFF` regardless of what the model wrote.
- **Post-conversion** — converting a lead stops the lead cadences and starts `MEMBER_NURTURE`, the
  only sequence allowed to run against a won lead. Upsells (second discipline, family add-on,
  private lessons, referrals) come from the knowledge base, not from every reply.

### Handoff and coach alerts

The agent hands off when it is out of verified facts, when the lead is upset, asks for a human,
raises injury or medical topics, or negotiates on price. A handoff stamps `Lead.handoffAt` /
`handoffReason`, logs a `HANDOFF` event, and texts the coach:

```
sendSms(BotConfig.coachAlertPhone,
  "<name> (<phone>) needs you: <reason>
   They said: \"<latest inbound>\"
   <PUBLIC_BASE_URL>/coach/leads/<id>")
```

Rate-limited to one alert per lead per `BotConfig.coachAlertHours` (default 6) by looking for a
recent `COACH_ALERTED` event; blank `coachAlertPhone` disables it. Lead quiet hours deliberately do
not apply — the recipient is staff. Configure both in `/coach/leads/settings`.

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
| HighLevel / Gymnetics SMS | `GHL_API_TOKEN`, `GHL_LOCATION_ID`, `GHL_WEBHOOK_SECRET` (optional `GHL_FROM_NUMBER`) | Texts from the number already on the sub-account, so no separate number or 10DLC registration. Add a HighLevel workflow triggered on inbound messages with a webhook action posting to `/api/webhooks/ghl/inbound?secret=$GHL_WEBHOOK_SECRET` |
| Twilio SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (or `TWILIO_MESSAGING_SERVICE_SID`) | Set the number's inbound webhook to `POST /api/webhooks/twilio/sms`; set `PUBLIC_BASE_URL` behind a proxy so signature validation works |
| Facebook Lead Ads | `FB_VERIFY_TOKEN`, `FB_APP_SECRET`, `FB_PAGE_ACCESS_TOKEN` | Subscribe the page's `leadgen` webhook to `/api/webhooks/facebook` (the `GET` handler answers Meta's verification challenge) |
| AI investigation | `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (optional `LLM_MODEL`) | Nothing to wire; falls back to the rules engine on any error |
| Dispatcher cron | `CRON_SECRET` | Schedule the `curl` above every minute |
| Stripe dues | `STRIPE_WEBHOOK_SECRET` (optional `STRIPE_BILLING_PORTAL_URL`) | Point a Stripe webhook at `POST /api/webhooks/stripe` for `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted` |

Only one SMS provider is used per send: HighLevel when `GHL_API_TOKEN` and `GHL_LOCATION_ID` are
set, else Twilio, else the mock. Outbound HighLevel sends upsert the lead as a contact first (the
API addresses messages by contact, not number), which also keeps one conversation thread per
person inside Gymnetics.

Compliance notes: STOP keywords opt a number out permanently, opted-out leads can't be texted from
the UI, and quiet hours are enforced for automated sends. The studio is still responsible for
consent language on its lead forms.

All data is clearly-labeled sample data until Atheneum supplies the real schedule, roster, and brand assets.

## Getting started

```bash
npm install
cp .env.example .env      # then set a real SESSION_SECRET
docker compose up -d db   # local Postgres on port 55432
npx prisma migrate dev    # apply migrations
npx prisma db seed        # load sample data
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
- `npm run db:migrate` / `npm run db:deploy` / `npm run db:seed` — database setup
- `npm test` / `npm run test:watch` — Vitest

## Tests

`tests/` covers the send path: the validation gate, the outbox state machine, and what an inbound
text does to a lead. They run against a real Postgres database, not a stub, because the outbox
relies on conditional updates the database has to arbitrate.

Configuration lives in `.env.test` (committed; it holds no secrets). Two safety properties are
deliberate rather than incidental:

- `tests/globalSetup.ts` refuses to run if `DATABASE_URL` names a database without "test" in it, so
  a stale shell variable can't have `prisma db push` wipe development data.
- The SMS provider is always mocked, and the credentials in `.env.test` are blank, so a test cannot
  text a real person even if the mock were removed.

Create the database once, then run the suite:

```bash
docker compose exec -T db psql -U postgres -c 'CREATE DATABASE atheneum_test'
npm test
```

## Deploying (Railway)

The repo includes `railway.json`. On Railway:

1. Create a service from this repo and add the **Postgres** plugin (it injects `DATABASE_URL`).
2. Set a random `SESSION_SECRET` (32+ chars), plus whatever integrations you're using from the table above.
3. Deploy — the start command (`npm run start:prod`) runs `prisma migrate deploy` and seeds sample data only if the database is empty.
4. Add a Railway cron running `npm run bot:tick` every minute so follow-ups actually go out.

Keep a second Railway environment (`staging`) pointed at your working branch with its own Postgres,
so the bot is never tested against real lead phone numbers.

### Membership, dues and LTV

One database holds both sides of the business: `Lead` (where someone came from) and `MemberProfile`
→ `Membership` → `Payment` (what they're worth). Converting a lead keeps the lead row and links it
to the new profile, so every payment stays credited to the ad, campaign, or walk-in that produced
it — that's what `/coach/growth` reports on.

Stripe is optional. Without it, dues are recorded by hand on the member page. With
`STRIPE_WEBHOOK_SECRET` set, point a Stripe webhook at `POST /api/webhooks/stripe`: paid invoices
land in the ledger (idempotently, keyed on the Stripe invoice ID), failed invoices flip the
membership to past due and text the member a link to update their card, and cancelled
subscriptions end the membership.

### Telemetry (`/coach/growth`)

The funnel is measured from rows the app already writes, so there is no separate event pipeline to
keep in sync: first-contact latency from `Lead.firstContactedAt`, replies from `LeadMessage`,
bookings and attendance from `TrialBooking`, conversion from `Membership`, money from `Payment`.
`src/lib/analytics/funnel.ts` is the only place these are defined; the dashboard and
`GET /api/metrics/funnel?days=30` both read it, and a nightly `MetricSnapshot` keeps history so
periods can be compared after the live numbers have moved on.

Three rules make the numbers trustworthy rather than flattering:

- Every rate carries its own numerator and denominator, and the UI prints both — a 100% built on two
  leads should look like what it is.
- Unknown is not failure. A past trial nobody marked is neither a show nor a no-show: it leaves the
  show-rate denominator and is surfaced as "unmarked" instead.
- Leads belong to a period by `createdAt` (when we got them), never `submittedAt`, which for CSV
  imports is the original enquiry date and would scatter imported leads across old periods.

Two inputs cannot be derived and are collected instead: ad spend, typed in at
`/coach/growth/spend` because no ad platform is connected, and staff attention, measured by a
beacon on the lead page that only counts time while the tab is visible and someone is actually
interacting — a lead page left open overnight adds nothing.

"Fully automated" stays at 0% while the agent runs in draft mode, by design. It and "drafts edited"
are the two numbers to watch before trusting autopilot.

## Current state (as of the sales-agent work)

What is real and what is still pending, since none of this is on `main` yet:

| Area | State |
| --- | --- |
| Feature branches | Four stacked PRs, all open: lead bot → members/LTV → HighLevel provider → sales agent. `main` is still the Next.js starter |
| Staging | Railway project `atheneum-crm-staging` with its own Postgres, deployed from the sales-agent branch, dispatcher on a 5-minute cron |
| LLM | Live on staging with `OPENAI_API_KEY` (`gpt-4o-mini`). Without a key, everything falls back to the rules engine and templates |
| SMS | **Not live.** No Twilio credentials are configured, so sends are recorded as provider `MOCK`. Twilio 10DLC brand is registered; the campaign was rejected once for unverifiable CTA proof and is being resubmitted |
| Production | The live portal still runs SQLite and needs a controlled migration to Postgres before it can share this database |
| Data | Sample schedule seeded from the studio's 08/01 grid. MMA is absent from that grid, so the agent will discuss MMA but never offer a time for it |

Nothing texts a real lead until Twilio credentials are set *and* the 10DLC campaign is approved.
Until then the safe way to exercise the funnel end to end is staging with the mock provider, which
records each message against the lead exactly as it would be sent.

## Notes

- Business rules (programs, class templates, capacities, age groups, weekly goals) live in the database, not in code, so the real schedule can replace the sample data without code changes.
- No public rankings or leaderboards, per Atheneum's inclusive-culture guidance.
- Billing, e-commerce, and external scheduling integrations are intentionally out of scope until the academy's current systems are known.
