# Backup & restore

The portal backs itself up automatically and any dump can be restored with one command. Dumps are provider-agnostic JSON (every table, IDs preserved), produced by `src/lib/datadump.ts`.

## Automatic backups

While the app is running with `BACKUP_DIR` set (production: `/data/backups` on the Railway volume), it writes a full JSON dump on boot and every 24 hours, keeping the 14 most recent files (`atheneum-<timestamp>.json`).

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

For a production restore, use the Railway Postgres connection string as `DATABASE_URL`, then redeploy or restart the `web` service so all app instances see the restored data.

## Disaster recovery (database lost entirely)

1. Provision a new Postgres service on Railway and point the `web` service's `DATABASE_URL` at it.
2. From a checkout of this repo: `DATABASE_URL=<new-url> npx prisma migrate deploy`
3. `DATABASE_URL=<new-url> npm run db:import -- <latest-backup>.json`
4. Redeploy the `web` service.

Uploads (member/coach photos) live separately on the `/data/uploads` volume and are not part of the JSON dump.
