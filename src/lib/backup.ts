import path from "path";
import fs from "fs/promises";
import { prisma } from "./db";
import { exportAll } from "./datadump";

const KEEP_COUNT = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export function backupDir(): string | null {
  return process.env.BACKUP_DIR || null;
}

/** Writes a full JSON dump of the database (restorable with `npm run db:import`). */
export async function runBackup(): Promise<string | null> {
  const dir = backupDir();
  if (!dir) return null;
  await fs.mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(dir, `atheneum-${stamp}.json`);
  const dump = await exportAll(prisma);
  await fs.writeFile(target, JSON.stringify(dump));

  const entries = (await fs.readdir(dir))
    .filter((f) => f.startsWith("atheneum-") && f.endsWith(".json"))
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
