import { test, expect } from "@playwright/test";
import { createMember, db, login } from "./helpers";

test.describe("start here tour & feedback", () => {
  test("member sees the start-here banner, opens the tour, and dismisses the banner", async ({
    page,
  }) => {
    await createMember("tourist@test.local", "Tina Tourist");
    await login(page, "tourist@test.local");

    await expect(page.getByText(/start with the quick tour/i)).toBeVisible();
    await page.getByRole("link", { name: "Start here" }).click();
    await expect(page.getByRole("heading", { name: "Start here" })).toBeVisible();
    await expect(page.getByText(/book your first class/i)).toBeVisible();

    await page.goto("/");
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByText(/start with the quick tour/i)).toHaveCount(0);

    const user = await db.user.findUniqueOrThrow({ where: { email: "tourist@test.local" } });
    expect(user.startHereDismissedAt).not.toBeNull();
  });

  test("member submits feedback and admin can see and resolve it", async ({ page, browser }) => {
    await createMember("critic@test.local", "Carl Critic");
    await login(page, "critic@test.local");

    await page.goto("/feedback");
    await page.fill("#feedback-message", "The schedule page is great but needs a week view.");
    await page.getByRole("button", { name: "Send feedback" }).click();
    await expect(page.getByRole("status")).toContainText(/thanks/i);
    await expect(page.getByText(/needs a week view/i)).toBeVisible();

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await login(adminPage, "admin@example.com");
    await adminPage.goto("/admin/feedback");
    await expect(adminPage.getByText("Carl Critic")).toBeVisible();
    await expect(adminPage.getByText(/needs a week view/i)).toBeVisible();

    await adminPage.getByRole("button", { name: "Mark resolved" }).click();
    await expect(adminPage.getByText(/resolved \(1\)/i)).toBeVisible();
    await adminContext.close();

    const item = await db.feedback.findFirstOrThrow({
      where: { user: { email: "critic@test.local" } },
    });
    expect(item.resolvedAt).not.toBeNull();

    const audit = await db.auditLog.findFirst({
      where: { action: "FEEDBACK_UPDATED", targetId: item.id },
    });
    expect(audit?.summary).toContain("Carl Critic");
  });

  test("coach role gets the coaching tour content", async ({ page }) => {
    await login(page, "coach@example.com");
    await page.goto("/start-here");
    await expect(page.getByText(/run today's classes/i)).toBeVisible();
    await expect(page.getByText(/fulfill shop orders/i)).toBeVisible();
  });
});
