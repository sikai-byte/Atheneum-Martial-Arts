# Atheneum Member Portal — Security Rundown

How personal data is protected today, plus a prioritized list of gaps and recommended hardening. Everything in "What's in place" is implemented and verified in the current production deployment.

## What personal data we hold

- Account data: name, email, role, bcrypt-hashed password, optional 4-digit kiosk PIN (bcrypt-hashed — never stored in plain text).
- Member data: memberships, bookings, attendance, progress, punch-pass counts.
- Household data: parent/child links and child profiles.
- Waivers: signed name, timestamp, waiver version, how it was signed (online / kiosk / recorded by staff).
- Photos: profile photos, community post photos, coach photos, product photos.
- Community content: posts and comments.
- Shop orders: product, size, quantity, price (no payment data yet — payment happens at the front desk; card data will live entirely in Stripe when that lands, never in our database).
- Telemetry: sign-ins, bookings, email events (operational analytics only).

## What's in place

### Authentication & sessions
- Passwords hashed with **bcrypt** (cost 10) — never stored or logged in plain text.
- Sessions are **iron-session** sealed cookies: encrypted + signed with `SESSION_SECRET`, `httpOnly` (JS can't read them), `Secure` (HTTPS-only), `SameSite=Lax`. The server refuses to boot in production without `SESSION_SECRET`.
- Password reset: 32-byte random token, stored only as a SHA-256 hash, 1-hour expiry, single-use, previous unused tokens invalidated on each request. Reset requests are rate-limited and don't reveal whether an email exists. Deactivated (leaver-hold) accounts can't request resets.
- Login lockout: 10 failed attempts (per email + IP) locks sign-in for 5 minutes — even with the correct password. Successful logins never count toward the limit, so shared gym Wi-Fi doesn't lock people out.

### Authorization
- Role guards on every page and server action: `requireUser` → `requireCoach` (coach + admin) → `requireAdmin` (admin only). Coaches cannot reach admin pages; members cannot reach coach or admin pages.
- Parents can only manage profiles in their own household.
- Admin impersonation ("View portal as") is admin-only, and every switch is written to the audit log.
- Deactivated (leaver-hold) accounts are treated as signed-out everywhere: login blocked, existing sessions no longer resolve to a user, kiosk lookup / rosters / leaderboards exclude them, impersonation into them is blocked.

### Kiosk
- The kiosk iPad uses a separate kiosk session cookie; enabling kiosk mode signs the admin out on that device, so a walk-up user never inherits staff access.
- Check-in requires name + PIN; PINs are bcrypt-hashed and wrong-PIN attempts lock after 15 failures per device for 5 minutes.
- Walk-in registration is rate-limited (8 per device per 15 minutes).
- The kiosk never exposes member contact details — only first names on today's rosters.

### Uploads & file serving
- All photos are served through **authenticated API routes** — nothing under a public URL. Signed-out requests get 401.
- Uploads validate MIME type (JPEG/PNG/WebP) and enforce an 8 MB limit; files are stored under server-generated IDs (e.g. `product-image-<id>`), never user-supplied filenames, so path traversal isn't possible.

### Database & injection
- PostgreSQL on Railway (private networking); all queries go through Prisma with parameterized queries — no string-built SQL, so SQL injection isn't possible through normal flows.
- React escapes all rendered content by default; no `dangerouslySetInnerHTML` in the app, which covers stored-XSS via posts/comments/names.
- Next.js server actions verify the request Origin, which covers CSRF for all mutations.

### Transport & headers
- HTTPS everywhere (Railway TLS) with `Strict-Transport-Security` (2 years, includeSubDomains).
- `Content-Security-Policy` restricting scripts, styles, images, fonts, connections, and form targets to our own origin (with `frame-ancestors 'none'`) — a strong backstop against XSS.
- `X-Frame-Options: DENY` (no clickjacking), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` locking camera to same-origin and disabling mic/geolocation/payment.

### Data lifecycle
- **Leaver workflow**: deactivation revokes access immediately, cancels future bookings, retains data for 7 years, then an automated scheduler permanently purges it. Admins can reactivate before purge, or permanently delete immediately (requires typing the person's exact name).
- Permanent deletion removes the account, profile, bookings, attendance, posts, comments, waivers, PINs, and uploaded photos; audit history of the deletion itself is preserved.
- **Audit log**: every admin/coach mutation (account changes, memberships, resets, impersonation, deactivation/deletion, content edits, photo changes) is recorded with actor, target, and timestamp — visible in Admin → Audit history.
- **Backups**: nightly automated backups to the Railway volume (`/data/backups`), AES-256-GCM encrypted when `BACKUP_ENCRYPTION_KEY` is set, with an optional mirror to S3-compatible off-site storage (`BACKUP_S3_*`). Restore procedure documented and tested in `docs/backup-restore.md`.

### Secrets
- All secrets (`SESSION_SECRET`, `DATABASE_URL`, Resend API key, `BACKUP_ENCRYPTION_KEY`, off-site storage keys) live in Railway environment variables — none are in the repository or logs. Keep an off-Railway copy of `BACKUP_ENCRYPTION_KEY` (e.g. in a password manager): without it, encrypted backups cannot be restored.

## Gaps & recommended hardening (prioritized)

1. **Destroy session cookies on deactivation** — a leaver's stale cookie is correctly rejected (they can't access anything), but the cookie itself isn't cleared until they hit the site. Cosmetic — access is already fully revoked.
2. ~~**Backup encryption/off-site copy**~~ — done: backups are AES-256-GCM encrypted and mirrored to S3-compatible off-site storage when configured (see `docs/backup-restore.md`).
3. **Rate limiting is in-memory** — resets on each deploy and is per-instance. Fine for the current single-instance deployment (noted in code); needs a shared store (e.g. Redis) only if we scale to multiple instances.
4. **Admin 2FA** — admin accounts are the crown jewels (they can see everyone). Worth adding TOTP two-factor for admin/coach accounts before wide launch.
5. **Session lifetime** — sessions currently use the iron-session default (~2 weeks). Consider a shorter lifetime for admin sessions specifically.
6. **Password policy** — minimum is 8 characters. Consider checking against known-breached passwords (haveibeenpwned k-anonymity API) at set/reset time.
7. **Kiosk device lockdown** — app-side protections are in place, but the iPad itself should run in Guided Access (Settings → Accessibility) so people can't leave the kiosk page.
8. **Dependency monitoring** — enable GitHub Dependabot alerts on the repo so vulnerable dependency versions get flagged automatically.
9. **Waiver/minor retention review** — the 7-year purge is a sound operational default, but signed waivers for minors may warrant longer retention in some states (until age of majority + statute of limitations). Worth a one-time check with your attorney; the purge window is a single constant (`RETENTION_YEARS`) if it needs to change.
