import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Page, expect } from "@playwright/test";
import { TEST_DATABASE_URL } from "../../playwright.config";

export const PASSWORD = "atheneum123";

// Direct DB access for fixtures/assertions, bound to the test database.
export const db = new PrismaClient({
  datasources: { db: { url: TEST_DATABASE_URL } },
});

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
}

export async function loginExpecting(page: Page, email: string, pathPattern: RegExp) {
  await login(page, email);
  await expect(page).toHaveURL(pathPattern);
}

/** Creates a standalone adult member account + profile for fixtures. */
export async function createMember(email: string, name: string) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const household = await db.household.create({ data: { name: `${name} Household` } });
  const user = await db.user.create({
    data: { email, passwordHash, name, role: "MEMBER", householdId: household.id },
  });
  const profile = await db.memberProfile.create({
    data: { name, userId: user.id, householdId: household.id },
  });
  return { user, profile, household };
}
