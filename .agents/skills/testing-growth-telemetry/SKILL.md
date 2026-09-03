---
name: testing-growth-telemetry
description: How to run and end-to-end test the Atheneum coach app locally, especially the /coach/growth funnel dashboard, ad spend entry, trial attendance and the staff-time beacon.
---

# Testing the Atheneum coach app locally (growth / funnel telemetry)

## Bring the app up
```bash
cd <repo>
cp -n .env.example .env
npm install
docker compose up -d db            # Postgres in container `atheneum-pg`, host port 55432
npx prisma migrate deploy
npm run db:seed
npm run dev                        # http://localhost:3000
```
Sample logins are in the README / `prisma/seed.ts`; password is `atheneum123`
(`coach@example.com` = COACH, `admin@example.com` = ADMIN). `/coach/*` requires COACH or ADMIN.
Twilio/LLM are absent by design: SMS uses a MOCK provider and the agent falls back to a rules
engine, so nothing is sent externally.

Query the DB directly for objective evidence:
```bash
docker exec atheneum-pg psql -U postgres -d atheneum -c 'select * from "StaffTouch";'
```
`Lead` has `fullName` (no `name`/`firstName`) — check `prisma/schema.prisma` before writing SQL.

## Exercising the growth dashboard
- Range tabs only honour `days=30|90|365|all`; any other value (`days=1`, `days=0`) silently falls
  back to 30 days, so you cannot pick an arbitrary window from the URL.
- To make ranges differ, backdate a lead: `update "Lead" set "createdAt" = now() - interval '200 days' where ...`.
- To prove empty-state formatting (every rate must render `—`, never `0%`/`NaN`), temporarily push
  **all** leads outside the window and restore afterwards:
  ```sql
  create table lead_backup as select id,"createdAt" from "Lead";
  update "Lead" set "createdAt" = now() - interval '400 days';
  -- inspect /coach/growth?days=30 ...
  update "Lead" l set "createdAt" = b."createdAt" from lead_backup b where b.id = l.id;
  drop table lead_backup;
  ```
  Always disclose such data manipulation in the report.

## Ad spend
`/coach/growth/spend`. The Source field is a datalist input — click it directly (or tab from the
top of the form) instead of clicking near the label, otherwise you focus the wrong control and get
the browser's native "Please fill out this field" instead of the server-side inline error.
Cost per lead / per member / ROAS stay `—` for a source until an `AdSpend` row exists for that
source; removing the row returns them to `—`.

## Trial attendance
`bookTrial` refuses past sessions (`src/lib/leads/engine.ts`), so to get a *past* trial: book the
lead into an upcoming class through the lead page, then move the session back:
```sql
update "ClassSession" set "startsAt" = now() - interval '1 day' where id = '<sessionId>';
```
Reload the lead page: Cancel disappears and "Showed up" / "No-show" appear. An unmarked past trial
must render the dashboard show rate as `—` with an "N unmarked" hint (never 0%).

## Staff-time beacon (`TimeOnLead`)
- Flushes every 60 s and on unmount/pagehide; totals under 5 s are dropped. Wait ≥ ~70 s on a lead
  page (with mouse movement) before expecting a `StaffTouch` row.
- Known/possible bug: hidden-tab time can still be credited. `accrue()` runs on
  `visibilitychange` and attributes the *whole* elapsed interval to the state observed *after* the
  change, so returning to a tab that was hidden < 120 s credits the hidden period. When testing
  "idle tab accrues nothing", hide the tab for **less** than 120 s and check for a new `StaffTouch`
  row — that is the case that fails. A fix would need to accrue before the state flips (and reset
  `lastTick` on becoming visible).
- Beware the omnibox autocompleting a typed lead URL to a different lead; navigate by clicking rows
  in `/coach/leads` so you know which lead you are timing.

## Metrics API
- Signed in: open `http://localhost:3000/api/metrics/funnel?days=30` in the browser tab to compare
  JSON against the rendered dashboard (do not curl with browser cookies).
- Anonymous: `curl -s -o /dev/null -w "%{http_code}" localhost:3000/api/metrics/funnel?days=30`
  must be `401` (`CRON_SECRET` is the only non-session path).

## Devin Secrets Needed
None — no external credentials are required for local testing.
