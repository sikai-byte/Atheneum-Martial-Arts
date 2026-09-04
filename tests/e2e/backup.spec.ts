import "./env-setup";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { backupKey, decryptBackup, encryptBackup } from "../../src/lib/backupCrypto";
import { runBackup } from "../../src/lib/backup";

test.describe("encrypted backups", () => {
  test("encrypt/decrypt roundtrip and tamper detection", () => {
    const key = crypto.randomBytes(32);
    const plaintext = Buffer.from(JSON.stringify({ hello: "world" }));
    const encrypted = encryptBackup(plaintext, key);
    expect(encrypted.equals(plaintext)).toBe(false);
    expect(decryptBackup(encrypted, key).equals(plaintext)).toBe(true);

    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptBackup(tampered, key)).toThrow();
  });

  test("runBackup writes an encrypted dump restorable with the key", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "atheneum-backup-"));
    const keyHex = crypto.randomBytes(32).toString("hex");
    process.env.BACKUP_DIR = dir;
    process.env.BACKUP_ENCRYPTION_KEY = keyHex;
    try {
      const target = await runBackup();
      expect(target).not.toBeNull();
      expect(target!.endsWith(".json.enc")).toBe(true);

      const raw = await fs.readFile(target!);
      // Encrypted payload must not leak the JSON dump.
      expect(raw.includes("passwordHash")).toBe(false);

      const dump = JSON.parse(decryptBackup(raw, backupKey()!).toString("utf8"));
      expect(dump.tables.user.length).toBeGreaterThan(0);
    } finally {
      delete process.env.BACKUP_DIR;
      delete process.env.BACKUP_ENCRYPTION_KEY;
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
