import "./env-setup";
import { test, expect } from "@playwright/test";
import { createMember, db, login } from "./helpers";

test.describe("digital punch card", () => {
  test("punch pass holder can open the punch card pop-up with correct punches", async ({
    page,
  }) => {
    const { profile } = await createMember("puncher@test.local", "Penny Puncher");
    await db.memberProfile.update({
      where: { id: profile.id },
      data: {
        membershipType: "PUNCH_PASS",
        membershipPlan: "10-Class Punch Pass",
        punchPassTotal: 10,
        punchPassUsed: 3,
      },
    });

    await login(page, "puncher@test.local");
    await page.getByRole("button", { name: "View punch card" }).click();

    const dialog = page.getByRole("dialog", { name: /punch card/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Penny Puncher");
    await expect(dialog).toContainText("10-Class Punch Pass");
    await expect(dialog.getByTestId("punch-used")).toHaveCount(3);
    await expect(dialog.getByTestId("punch-left")).toHaveCount(7);
    await expect(dialog).toContainText("7");
    await expect(dialog).toContainText(/classes left/i);

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("members without a punch pass see no punch card button", async ({ page }) => {
    const { profile } = await createMember("nopass@test.local", "Norm NoPass");
    await db.memberProfile.update({
      where: { id: profile.id },
      data: {
        membershipType: "MONTHLY",
        membershipPlan: "Adult Monthly",
        membershipRenewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await login(page, "nopass@test.local");
    await expect(page.getByRole("heading", { name: /membership/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "View punch card" })).toHaveCount(0);
  });
});
