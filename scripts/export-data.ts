import fs from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { exportAll } from "../src/lib/datadump";

// Usage: npm run db:export -- [outfile]   (defaults to atheneum-export-<timestamp>.json)
// Exports every table of the DATABASE_URL database as a JSON dump for backup or migration.
async function main() {
  const outfile =
    process.argv[2] ??
    `atheneum-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const prisma = new PrismaClient();
  try {
    const dump = await exportAll(prisma);
    await fs.writeFile(outfile, JSON.stringify(dump));
    const counts = Object.entries(dump.tables)
      .map(([table, rows]) => `${table}=${rows.length}`)
      .join(" ");
    console.log(`Exported to ${outfile}\n${counts}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
