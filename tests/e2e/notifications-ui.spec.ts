import "./env-setup";
import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.use({ permissions: ["notifications"] });

test.describe("notifications card on My account", () => {
  test("member sees the reminder explanation and the state-appropriate control", async ({
    page,
  }) => {
    await login(page, "member@example.com");
    await page.goto("/account");

    const card = page.locator("section", { hasText: "Notifications" }).first();
    await expect(card.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(card).toContainText("24 hours and 2 hours before every class");

    // Headless browsers may hard-deny notifications; assert the matching state UI.
    const permission = await page.evaluate(() => Notification.permission);
    if (permission === "denied") {
      await expect(card).toContainText("Notifications are blocked for this app");
      await expect(
        card.getByRole("button", { name: "Turn on class reminders" })
      ).toHaveCount(0);
    } else {
      await expect(
        card.getByRole("button", { name: "Turn on class reminders" })
      ).toBeVisible();
    }
  });
});
