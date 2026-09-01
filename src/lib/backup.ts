import path from "path";
import fs from "fs/promises";
import { prisma } from "./db";

const KEEP_COUNT = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function databaseFile(): string | null {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) return null;
  const file = url.slice("file:".length).split("?")[0];
  return path.isAbsolute(file) ? file : path.join(process.cwd(), "prisma", file);
}

// VACUUM INTO is SQLite-only; on Postgres the host takes managed backups instead.
export function backupDir(): string | null {
  const file = databaseFile();
  if (!file) return null;
  return process.env.BACKUP_DIR ?? path.join(path.dirname(file), "backups");
}

export async function runBackup(): Promise<string | null> {
  const dir = backupDir();
  if (!dir) return null;
  await fs.mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(dir, `atheneum-${stamp}.db`);
  // VACUUM INTO writes a consistent, compacted snapshot without locking writers out.
  await prisma.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`);

  const entries = (await fs.readdir(dir))
    .filter((f) => f.startsWith("atheneum-") && f.endsWith(".db"))
    .sort()
    .reverse();
  for (const stale of entries.slice(KEEP_COUNT)) {
    await fs.unlink(path.join(dir, stale));
  }
  return target;
}

export function startBackupSchedule(): void {
  const globalState = globalThis as unknown as { backupTimer?: ReturnType<typeof setInterval> };
  if (globalState.backupTimer) return;

  const tick = async () => {
    try {
      const target = await runBackup();
      if (target) console.log(`[backup] Database backed up to ${target}`);
    } catch (err) {
      console.error("[backup] Backup failed:", err);
    }
  };
  void tick();
  globalState.backupTimer = setInterval(tick, DAY_MS);
}
