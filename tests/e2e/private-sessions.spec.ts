import "./env-setup";
import { test, expect } from "@playwright/test";
import { createMember, db, login } from "./helpers";

test.describe("private training sessions", () => {
  test("coach logs a private session with notes and the member sees it on progress", async ({
    page,
  }) => {
    const { profile } = await createMember("comp@test.local", "Cora Competitor");

    await login(page, "coach@example.com");
    await page.goto("/coach/private-sessions");
    await page.selectOption('select[name="profileId"]', profile.id);
    await page.fill('textarea[name="notes"]', "Worked on double leg entries and cage wrestling.");
    await page.getByRole("button", { name: "Log session" }).click();
    await expect(page.locator("li", { hasText: "Cora Competitor" })).toBeVisible();
    await expect(page.getByText("Worked on double leg entries and cage wrestling.")).toBeVisible();

    const record = await db.privateSession.findFirstOrThrow({
      where: { profileId: profile.id },
    });
    expect(record.notes).toContain("double leg");
    expect(record.recordedBy).toBeTruthy();

    // No scheduled-class side effects.
    expect(await db.booking.count({ where: { profileId: profile.id } })).toBe(0);
    expect(await db.attendance.count({ where: { profileId: profile.id } })).toBe(0);

    // Member sees the session on their progress page.
    await page.context().clearCookies();
    await login(page, "comp@test.local");
    await page.goto("/progress");
    await expect(page.getByText("Private sessions", { exact: true })).toBeVisible();
    await expect(page.getByText("Worked on double leg entries and cage wrestling.")).toBeVisible();
  });

  test("coach can remove a logged private session", async ({ page }) => {
    const { profile } = await createMember("comp2@test.local", "Del Deleted");
    await db.privateSession.create({
      data: { profileId: profile.id, notes: "To be removed", recordedBy: "Coach Test" },
    });

    await login(page, "coach@example.com");
    await page.goto("/coach/private-sessions");
    await expect(page.getByText("To be removed")).toBeVisible();
    const card = page.locator("li", { hasText: "Del Deleted" });
    await card.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("To be removed")).toHaveCount(0);

    expect(await db.privateSession.count({ where: { profileId: profile.id } })).toBe(0);
  });

  test("members cannot open the private-sessions coach page", async ({ page }) => {
    await createMember("comp3@test.local", "Mia Member");
    await login(page, "comp3@test.local");
    await page.goto("/coach/private-sessions");
    await expect(page).toHaveURL(/\/$/);
  });
});
