import { execSync } from "node:child_process";
import { TEST_DATABASE_URL } from "../../playwright.config";

export default function globalSetup() {
  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
  execSync("npx prisma db push --force-reset --skip-generate", { env, stdio: "inherit" });
  execSync("npx prisma db seed", { env, stdio: "inherit" });
}
