import { test, expect } from "@playwright/test";
import { createMember, db, login } from "./helpers";

test.describe("admin tools & audit history", () => {
  test("admin can create a member account, book and cancel a class for them", async ({ page }) => {
    await login(page, "admin@example.com");

    await page.fill("#new-name", "Nadia Newmember");
    await page.fill("#new-email", "nadia@test.local");
    await page.fill("#new-password", "temporary-pw-1");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/admin\/member\//);
    await expect(page.getByRole("status")).toContainText(/account created/i);
    const user = await db.user.findUnique({ where: { email: "nadia@test.local" } });
    expect(user?.role).toBe("MEMBER");

    // Book a group class for them from their member page.
    await page.locator('select[name="sessionId"]').selectOption({ index: 1 });
    await page.getByRole("button", { name: "Book group class" }).click();
    await expect(page.getByText("Upcoming bookings")).toBeVisible();

    const profile = await db.memberProfile.findUniqueOrThrow({ where: { userId: user!.id } });
    const booking = await db.booking.findFirstOrThrow({ where: { profileId: profile.id } });
    expect(booking.status).toBe("BOOKED");

    // Cancel it again.
    await page.getByRole("button", { name: "Cancel" }).first().click();
    await expect(page.getByText("Upcoming bookings")).toHaveCount(0);
    const cancelled = await db.booking.findFirstOrThrow({ where: { profileId: profile.id } });
    expect(cancelled.status).toBe("CANCELLED");

    // Every step above landed in the audit trail.
    const actions = (
      await db.auditLog.findMany({ where: { targetId: { in: [user!.id, profile.id] } } })
    ).map((a) => a.action);
    expect(actions).toContain("ACCOUNT_CREATED");
    expect(actions).toContain("BOOKING_CREATED");
    expect(actions).toContain("BOOKING_CANCELLED");
  });

  test("audit page lists staff actions newest-first, admin only", async ({ page }) => {
    await login(page, "admin@example.com");
    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: /audit history/i })).toBeVisible();
    await expect(page.getByText("Account created").first()).toBeVisible();
  });

  test("analytics dashboard renders its metric sections", async ({ page }) => {
    await login(page, "admin@example.com");
    await page.goto("/admin/analytics");
    for (const section of [
      /weekly active members/i,
      /booking adoption/i,
      /attendance, cancellations & no-shows/i,
      /retention & churn/i,
      /absent 30\+ days/i,
      /manual messages eliminated/i,
    ]) {
      await expect(page.getByText(section).first()).toBeVisible();
    }
  });

  test("converting a trial to a paid membership records the conversion", async ({ page }) => {
    const { profile } = await createMember("convert.trial@test.local", "Connie Convert");
    await db.memberProfile.update({
      where: { id: profile.id },
      data: {
        membershipPlan: "Trial",
        membershipType: "TRIAL",
        membershipRenewsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        trialStartedAt: new Date(),
      },
    });

    await login(page, "admin@example.com");
    await page.goto(`/admin/member/${profile.id}`);
    await page.locator('select[name="membershipType"]').selectOption("MONTHLY");
    await page.fill('input[name="membershipPlan"]', "Adult Unlimited");
    await page.getByRole("button", { name: "Save membership" }).click();
    await expect(page.getByRole("status")).toContainText(/membership/i);

    const updated = await db.memberProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(updated.membershipType).toBe("MONTHLY");
    expect(updated.trialConvertedAt).not.toBeNull();

    const event = await db.telemetryEvent.findFirst({
      where: { type: "TRIAL_CONVERTED", profileId: profile.id },
    });
    expect(event).not.toBeNull();

    // The conversion shows up on the analytics dashboard.
    await page.goto("/admin/analytics");
    await expect(page.getByText(/trial conversion/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Connie Convert/ })).toBeVisible();
  });

  test("admin membership update is audited", async ({ page }) => {
    const jordan = await db.memberProfile.findFirstOrThrow({ where: { name: "Jordan Lee" } });
    await login(page, "admin@example.com");
    await page.goto(`/admin/member/${jordan.id}`);
    await page.getByRole("button", { name: "Save membership" }).click();
    await expect(page.getByRole("status")).toContainText(/membership/i);

    const entry = await db.auditLog.findFirst({
      where: { action: "MEMBERSHIP_UPDATED", targetId: jordan.id },
    });
    expect(entry).not.toBeNull();
    expect(entry?.actorRole).toBe("ADMIN");
  });
});
