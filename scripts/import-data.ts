import fs from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { importAll, type DataDump } from "../src/lib/datadump";
import { backupKey, decryptBackup } from "../src/lib/backupCrypto";

// Usage: npm run db:import -- <dumpfile.json | dumpfile.json.enc>
// Encrypted dumps require BACKUP_ENCRYPTION_KEY.
// DESTRUCTIVE: replaces ALL data in the DATABASE_URL database with the dump's contents.
async function main() {
  const infile = process.argv[2];
  if (!infile) {
    console.error("Usage: npm run db:import -- <dumpfile.json | dumpfile.json.enc>");
    process.exit(1);
  }
  let raw: Buffer = await fs.readFile(infile);
  if (infile.endsWith(".enc")) {
    const key = backupKey();
    if (!key) {
      console.error("Encrypted dump: set BACKUP_ENCRYPTION_KEY (64 hex chars) to decrypt it.");
      process.exit(1);
    }
    raw = decryptBackup(raw, key);
  }
  const dump = JSON.parse(raw.toString("utf8")) as DataDump;
  const prisma = new PrismaClient();
  try {
    await importAll(prisma, dump);
    const counts = Object.entries(dump.tables)
      .map(([table, rows]) => `${table}=${rows.length}`)
      .join(" ");
    console.log(`Imported ${infile} (exported ${dump.exportedAt})\n${counts}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
