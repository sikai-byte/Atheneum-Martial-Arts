import path from "path";
import fs from "fs/promises";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "./db";
import { exportAll } from "./datadump";
import { backupKey, encryptBackup } from "./backupCrypto";

const KEEP_COUNT = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export function backupDir(): string | null {
  return process.env.BACKUP_DIR || null;
}

function offsiteConfig() {
  const bucket = process.env.BACKUP_S3_BUCKET;
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    prefix: process.env.BACKUP_S3_PREFIX || "backups/",
    client: new S3Client({
      region: process.env.BACKUP_S3_REGION || "auto",
      endpoint: process.env.BACKUP_S3_ENDPOINT || undefined,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

async function uploadOffsite(filename: string, body: Buffer): Promise<boolean> {
  const config = offsiteConfig();
  if (!config) return false;
  await config.client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: `${config.prefix}${filename}`,
      Body: body,
      ContentType: "application/octet-stream",
    })
  );
  return true;
}

/**
 * Writes a full JSON dump of the database (restorable with `npm run db:import`),
 * AES-256-GCM encrypted when BACKUP_ENCRYPTION_KEY is set, and mirrors it to
 * S3-compatible off-site storage when BACKUP_S3_* is configured.
 */
export async function runBackup(): Promise<string | null> {
  const dir = backupDir();
  if (!dir) return null;
  await fs.mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dump = Buffer.from(JSON.stringify(await exportAll(prisma)));

  const key = backupKey();
  if (!key && process.env.NODE_ENV === "production") {
    console.warn("[backup] BACKUP_ENCRYPTION_KEY not set — writing unencrypted backup");
  }
  const filename = key ? `atheneum-${stamp}.json.enc` : `atheneum-${stamp}.json`;
  const body = key ? encryptBackup(dump, key) : dump;

  const target = path.join(dir, filename);
  await fs.writeFile(target, body);

  try {
    if (await uploadOffsite(filename, body)) {
      console.log(`[backup] Mirrored ${filename} to off-site storage`);
    }
  } catch (err) {
    console.error("[backup] Off-site upload failed:", err);
  }

  const entries = (await fs.readdir(dir))
    .filter((f) => f.startsWith("atheneum-") && (f.endsWith(".json") || f.endsWith(".json.enc")))
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
