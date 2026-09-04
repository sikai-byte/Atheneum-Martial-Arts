# Backup & restore

The portal backs itself up automatically and any dump can be restored with one command. Dumps are provider-agnostic JSON (every table, IDs preserved), produced by `src/lib/datadump.ts`.

## Automatic backups

While the app is running with `BACKUP_DIR` set (production: `/data/backups` on the Railway volume), it writes a full dump on boot and every 24 hours, keeping the 14 most recent files.

- With `BACKUP_ENCRYPTION_KEY` set (64 hex chars = a 32-byte AES-256-GCM key), dumps are encrypted as `atheneum-<timestamp>.json.enc`. Generate a key with `openssl rand -hex 32`, set it on the `web` service, and **keep a copy outside Railway** (password manager) — encrypted backups are unrestorable without it.
- Without the key, dumps are plaintext `atheneum-<timestamp>.json` (the app logs a warning in production).

### Off-site mirror

When these env vars are set, every backup is also uploaded to S3-compatible storage (AWS S3, Cloudflare R2, Backblaze B2):

| Variable | Meaning |
| --- | --- |
| `BACKUP_S3_BUCKET` | bucket name (required) |
| `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` | credentials (required) |
| `BACKUP_S3_ENDPOINT` | endpoint URL (required for R2/B2; omit for AWS) |
| `BACKUP_S3_REGION` | region (default `auto`) |
| `BACKUP_S3_PREFIX` | object key prefix (default `backups/`) |

Remote copies are never deleted by the app — use a bucket lifecycle rule (e.g. expire after 30–90 days) for remote retention. Upload failures are logged but never block the local backup.

## Manual backup

```bash
npm run db:export -- my-backup.json      # dumps the DATABASE_URL database
```

Against production, run it inside the Railway service:

```bash
railway ssh --service web -- ls /data/backups        # list automatic backups
```

To pull a backup file to your machine, base64 it over SSH:

```bash
railway ssh --service web -- base64 /data/backups/<file>.json | base64 -d > local-backup.json
```

## Restore

Restoring **replaces all data** in the target database with the dump's contents. The target schema must be current (`npx prisma migrate deploy`).

```bash
DATABASE_URL=<target-postgres-url> npx prisma migrate deploy
DATABASE_URL=<target-postgres-url> npm run db:import -- my-backup.json
```

Encrypted dumps import directly — provide the key:

```bash
BACKUP_ENCRYPTION_KEY=<hex-key> DATABASE_URL=<url> npm run db:import -- atheneum-<stamp>.json.enc
```

To just decrypt a dump for inspection:

```bash
BACKUP_ENCRYPTION_KEY=<hex-key> npm run backup:decrypt -- atheneum-<stamp>.json.enc out.json
```

For a production restore, use the Railway Postgres connection string as `DATABASE_URL`, then redeploy or restart the `web` service so all app instances see the restored data.

## Disaster recovery (database lost entirely)

1. Provision a new Postgres service on Railway and point the `web` service's `DATABASE_URL` at it.
2. From a checkout of this repo: `DATABASE_URL=<new-url> npx prisma migrate deploy`
3. `DATABASE_URL=<new-url> npm run db:import -- <latest-backup>.json`
4. Redeploy the `web` service.

Uploads (member/coach photos) live separately on the `/data/uploads` volume and are not part of the JSON dump.
