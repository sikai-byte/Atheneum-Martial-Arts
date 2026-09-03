import fs from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { importAll, type DataDump } from "../src/lib/datadump";

// Usage: npm run db:import -- <dumpfile.json>
// DESTRUCTIVE: replaces ALL data in the DATABASE_URL database with the dump's contents.
async function main() {
  const infile = process.argv[2];
  if (!infile) {
    console.error("Usage: npm run db:import -- <dumpfile.json>");
    process.exit(1);
  }
  const dump = JSON.parse(await fs.readFile(infile, "utf8")) as DataDump;
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
