import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Loaded here rather than in a setup file: `src/lib/db.ts` reads DATABASE_URL when it is first
 * imported, so the value has to exist before a worker imports anything from the app.
 */
const env = parse(fs.readFileSync(path.join(root, ".env.test")));

// `test.env` only reaches the workers; the global setup that migrates the database runs here in
// the main process, so it needs the values too.
Object.assign(process.env, env);

export default defineConfig({
  resolve: { alias: { "@": path.join(root, "src") } },
  test: {
    env,
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/globalSetup.ts"],
    // Every file talks to one Postgres database and truncates it between tests, so running two
    // files at once would have them deleting each other's rows.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
