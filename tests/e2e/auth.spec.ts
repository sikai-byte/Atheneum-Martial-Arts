import { test, expect } from "@playwright/test";
import { login, loginExpecting } from "./helpers";

test.describe("authentication & role access", () => {
  test("rejects a wrong password", async ({ page }) => {
    await login(page, "member@example.com", "wrong-password");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/doesn't match our records/i)).toBeVisible();
  });

  test("redirects unauthenticated visitors to /login", async ({ page }) => {
    for (const path of ["/", "/schedule", "/coach", "/admin", "/admin/audit"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("member lands on home and cannot reach coach or admin areas", async ({ page }) => {
    await loginExpecting(page, "member@example.com", /\/$/);
    await page.goto("/coach");
    await expect(page).not.toHaveURL(/\/coach/);
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
    await page.goto("/admin/audit");
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test("coach lands on /coach and cannot reach admin", async ({ page }) => {
    await loginExpecting(page, "coach@example.com", /\/coach/);
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test("admin lands on /admin", async ({ page }) => {
    await loginExpecting(page, "admin@example.com", /\/admin/);
    await expect(page.getByRole("link", { name: /audit history/i })).toBeVisible();
  });

  test("sign out ends the session", async ({ page }) => {
    await loginExpecting(page, "member@example.com", /\/$/);
    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/schedule");
    await expect(page).toHaveURL(/\/login/);
  });
});
