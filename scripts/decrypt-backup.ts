import fs from "node:fs/promises";
import { backupKey, decryptBackup } from "../src/lib/backupCrypto";

// Usage: BACKUP_ENCRYPTION_KEY=<hex> npm run backup:decrypt -- <dump.json.enc> <out.json>
async function main() {
  const [infile, outfile] = process.argv.slice(2);
  if (!infile || !outfile) {
    console.error("Usage: npm run backup:decrypt -- <dump.json.enc> <out.json>");
    process.exit(1);
  }
  const key = backupKey();
  if (!key) {
    console.error("Set BACKUP_ENCRYPTION_KEY (64 hex chars) to decrypt backups.");
    process.exit(1);
  }
  await fs.writeFile(outfile, decryptBackup(await fs.readFile(infile), key));
  console.log(`Decrypted ${infile} -> ${outfile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
