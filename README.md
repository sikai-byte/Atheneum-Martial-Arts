# Atheneum Martial Arts — Member Portal

A full member portal for **Atheneum Martial Arts** (825 Meander Court, Medina, MN — "Train for Life" / "Your Only Limit Is Your Tribe"). Members book classes, track progress, shop team gear, and connect with the gym community; coaches run rosters and attendance; admins manage members, trials, memberships, and site content — all self-hosted and fully owned by the gym.

**Live:** https://portal.atheneummartialarts.com (deployed on Railway)

## Tech stack

- **Next.js 14** (App Router, server components + server actions) with TypeScript and Tailwind CSS
- **Prisma + SQLite** (single-file DB on a Railway persistent volume at `/data/atheneum.db`)
- **iron-session** cookie auth, **bcryptjs** password hashing
- **Resend** (HTTP API) for transactional email from `portal@atheneummartialarts.com` (verified domain)
- **sharp** for server-side image processing; uploads stored on the `/data/uploads` volume
- Installable **PWA** (manifest + network-only service worker) for iOS/Android home-screen use

There is no separate backend — all mutations are Next.js server actions in `src/lib/actions.ts` (member/coach/admin flows) and `src/lib/adminContent.ts` (content editors), guarded by `requireUser()` / `requireCoach()` / `requireAdmin()`.

## Roles

| Role | Can do |
| --- | --- |
| `MEMBER` | Book/cancel classes for themselves, view progress, shop, community, profile photo |
| `PARENT` | Everything a member can, plus manage child profiles in their household and book for kids |
| `COACH` | Today's classes, rosters, one-tap attendance check-in, milestones, announcements, shop order fulfillment, community moderation |
| `ADMIN` | Everything a coach can, plus member management, trial workflow, membership editing, password resets, and site content editing |

Sample accounts (local dev, password `atheneum123`): `member@example.com`, `parent@example.com`, `coach@example.com`, `admin@example.com`.

## Features

### Members & parents
- **Home dashboard** — next booked class, membership card, punch-pass tracker, weekly attendance progress, recommended classes, coach announcements, profile photo (camera or upload, with crop editor)
- **Schedule & booking** — real weekly schedule with adult/kids views (parent toggle), program and beginner-friendly filters, book/cancel with instant pending feedback, automatic waitlist + promotion when a spot opens
- **Capacity rule** — group classes display **12 public spots** but quietly allow booking up to **16** (hidden overbook buffer of 4) before waitlisting
- **Progress** — attendance history, weekly consistency vs. goal, coach-recorded milestones
- **Leaderboard** — top-10 attending adults and kids, monthly (browsable) and all-time, from coach check-ins
- **Coaches page** — main coach photos/bios/disciplines + assistant coaches
- **Team shop** — branded gear catalog with sizes; order in-app, pay at the front desk on pickup
- **Community board** — posts with photos, questions, news; comments; authors delete their own, coaches/admins moderate
- **Account** — self-serve password change; **password reset by email** (`/forgot-password` → single-use hashed token, 1-hour expiry)

### Coaches
- Today's classes with rosters, one-tap attendance check-in (auto-deducts punch-pass classes), milestones, announcements posted to every member's home, shop order fulfillment

### Admins (`/admin`)
- **Member management** — create member/parent/coach/admin accounts, add child profiles to households, searchable household list, per-member pages to edit membership (plan/type/renewal/punch-pass), reset passwords
- **Trial workflow** — create a trial account (default 1-week expiry, `membershipType: "TRIAL"`); book their first class as a **group trial** (any scheduled class) or **private trial** (30/45/60 min, any open 8 AM–8 PM slot that doesn't overlap a scheduled class); restrict which type each trial member can book (`trialClassType`: both / group only / private only); copyable sign-in text for the gym's lead bot to send via SMS; every admin action ends with a clear success banner and a 3-step trial-setup checklist
- **Automatic emails** — trial welcome email (sign-in link + temp password) on account creation; booking-confirmation email on group/private trial booking
- **Site content editors** (Squarespace-style, no code): coaches (bios/disciplines/photos with drag/zoom crop), shop products (prices/sizes/add/retire — order history preserved), and schedule/classes (weekly slots, capacity, instructors, cancel/restore sessions)

### Operations
- **Nightly SQLite backups** to `/data/backups` (14 most recent kept), started via Next.js instrumentation
- Trial bookings are blocked past the trial end date server-side; validation errors surface as inline banners (`?error=...`), successes as green banners (`?success=...`) — never generic error pages

## Data model (Prisma, `prisma/schema.prisma`)

`User` (auth + role) → `Household` → `MemberProfile` (adults and children; children are profiles, never accounts). Classes: `Program` → `ClassTemplate` → `RecurringSlot` → `ClassSession` → `Booking` / `Attendance` / `Milestone`. Plus `CoachProfile`, `Product`/`Order` (shop), `Post`/`Comment` (community), `Announcement`, `PasswordResetToken`.

Business rules (programs, templates, capacities, age groups) live in the database and are editable in the admin UI — not hardcoded.

## Getting started (local dev)

```bash
npm install
cp .env.example .env   # set a real SESSION_SECRET; RESEND_API_KEY optional locally (emails log to console)
npm run db:push        # create the SQLite database
npm run db:seed        # load sample data
npm run dev
```

Open http://localhost:3000 and sign in with a sample account above.

Scripts: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run db:push`, `npm run db:seed`. E2E testing guidance lives in `.agents/skills/testing-atheneum-portal/SKILL.md`.

## Deployment (Railway)

`railway.json` defines the deploy. The Railway service needs:

1. A **volume** mounted at `/data` (database, uploads, backups)
2. Env vars: `DATABASE_URL=file:/data/atheneum.db`, `SESSION_SECRET` (32+ random chars), `UPLOAD_DIR=/data/uploads`, `RESEND_API_KEY`, `EMAIL_FROM="Atheneum Martial Arts <portal@atheneummartialarts.com>"`, `APP_URL=https://portal.atheneummartialarts.com`

The start command pushes the Prisma schema, seeds only if the DB is empty, and `exec`s `next start` directly (clean SIGTERM shutdown on redeploys; Node prefers IPv4 DNS so server-action redirects resolve correctly).

Deploy from a local checkout with `railway up --service web`.

## Status & roadmap

**Done and live:** everything above, validated with lint/typecheck/build, scripted test suites (including a 1,055-case stress pass), and browser E2E runs across all roles.

**Before member launch:** load real coach/member data and remove sample accounts; set real shop prices (or hide the Shop tab); an admin dry run on a phone; soft launch with 5–10 friendly members.

**Planned next:** announcement/class-reminder notifications; retention flags for members absent 2+ weeks; Stripe payments in the shop; Twilio for automatic trial invite texts; optional App Store/Play Store wrapper (Capacitor); longer-term multi-tenant SaaS for other gyms.
