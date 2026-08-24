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
