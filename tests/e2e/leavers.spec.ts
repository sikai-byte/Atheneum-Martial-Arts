import { test, expect } from "@playwright/test";
import { createMember, db, login } from "./helpers";

test.describe("leaver workflow", () => {
  test("admin can place a member on leaver hold, blocking sign-in, then reactivate", async ({
    page,
  }) => {
    const { user, profile } = await createMember("leaver@test.local", "Lena Leaver");

    await login(page, "admin@example.com");
    await page.goto(`/admin/member/${profile.id}`);
    await page.getByRole("button", { name: "Place on leaver hold" }).click();
    await expect(page.getByRole("status")).toContainText(/leaver hold/i);

    const held = await db.memberProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(held.deactivatedAt).not.toBeNull();
    const heldUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(heldUser.deactivatedAt).not.toBeNull();

    // Held members can't sign in.
    await page.goto("/logout").catch(() => {});
    await page.context().clearCookies();
    await login(page, "leaver@test.local");
    await expect(page.getByText(/deactivated/i)).toBeVisible();

    // Reactivation restores access.
    await login(page, "admin@example.com");
    await page.goto(`/admin/member/${profile.id}`);
    await page.getByRole("button", { name: /^Reactivate/ }).click();
    await expect(page.getByRole("status")).toContainText(/active again/i);

    await page.context().clearCookies();
    await login(page, "leaver@test.local");
    await expect(page).toHaveURL(/\/$/);

    const actions = (
      await db.auditLog.findMany({ where: { targetId: profile.id } })
    ).map((a) => a.action);
    expect(actions).toContain("ACCOUNT_DEACTIVATED");
    expect(actions).toContain("ACCOUNT_REACTIVATED");
  });

  test("admin can permanently delete all data with name confirmation", async ({ page }) => {
    const { user, profile } = await createMember("purge@test.local", "Pete Purged");

    await login(page, "admin@example.com");
    await page.goto(`/admin/member/${profile.id}`);

    // Wrong confirmation name is rejected.
    await page.fill('input[name="confirmName"]', "Wrong Name");
    await page.getByRole("button", { name: "Delete all data" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText(/exactly to confirm/i);

    await page.fill('input[name="confirmName"]', "Pete Purged");
    await page.getByRole("button", { name: "Delete all data" }).click();
    await expect(page).toHaveURL(/\/admin\?/);
    await expect(page.getByRole("status")).toContainText(/permanently deleted/i);

    expect(await db.memberProfile.findUnique({ where: { id: profile.id } })).toBeNull();
    expect(await db.user.findUnique({ where: { id: user.id } })).toBeNull();

    const actions = (
      await db.auditLog.findMany({ where: { targetId: profile.id } })
    ).map((a) => a.action);
    expect(actions).toContain("ACCOUNT_DELETED");
  });
});
