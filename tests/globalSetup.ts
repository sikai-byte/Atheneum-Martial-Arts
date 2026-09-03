import { execFileSync } from "node:child_process";

/**
 * Brings the test database up to the current schema once per run. The name guard is the important
 * part: `prisma migrate reset` on a URL someone left pointing at development would silently delete
 * the studio's seeded data.
 */
export default function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set; tests read it from .env.test");

  const database = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(database)) {
    throw new Error(
      `Refusing to run tests against "${database}": the database name must contain "test".`,
    );
  }

  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    stdio: "inherit",
    env: process.env,
  });
}
