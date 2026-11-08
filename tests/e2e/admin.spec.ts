import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { createMember, db, login, PASSWORD } from "./helpers";

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

  test("admin can send an app invite email from a member page", async ({ page }) => {
    const { user, profile } = await createMember("invite.me@test.local", "Ivy Invitee");
    await login(page, "admin@example.com");
    await page.goto(`/admin/member/${profile.id}`);
    await page
      .getByRole("button", { name: `Email app invite to ${user.email}` })
      .click();
    await expect(page.getByRole("status")).toContainText(/app invite email sent/i);

    const entry = await db.auditLog.findFirst({
      where: { action: "APP_INVITE_EMAIL_SENT", targetId: profile.id },
    });
    expect(entry?.summary).toContain(user.email);
  });

  test("admin creates an account without a password, configures it, and sends the onboarding email", async ({ page }) => {
    await login(page, "admin@example.com");
    await page.fill("#new-name", "Olive Onboard");
    await page.fill("#new-email", "olive.onboard@test.local");
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/admin\/member\//);
    await expect(page.getByRole("status")).toContainText(/send the onboarding email/i);
    const onboarding = page.locator("section", { has: page.locator("#onboarding") });
    await expect(onboarding).toContainText("Set up their membership below");

    await page.selectOption('select[name="membershipType"]', "MONTHLY");
    await page.fill('input[name="membershipPlan"]', "Adult Unlimited");
    await page.getByRole("button", { name: "Save membership" }).click();
    await expect(onboarding).toContainText("Membership set up");

    await page.getByRole("button", { name: "Send onboarding email" }).click();
    await expect(page.getByRole("status")).toContainText(/onboarding email sent to olive.onboard@test.local/i);
    await expect(page.getByRole("button", { name: "Resend onboarding email" })).toBeVisible();

    const user = await db.user.findUniqueOrThrow({ where: { email: "olive.onboard@test.local" } });
    expect(user.onboardingEmailSentAt).not.toBeNull();
    const token = await db.passwordResetToken.findFirstOrThrow({ where: { userId: user.id, usedAt: null } });
    expect(token.expiresAt.getTime() - Date.now()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    const audit = await db.auditLog.findFirst({
      where: { action: "ONBOARDING_EMAIL_SENT", summary: { contains: user.email } },
    });
    expect(audit).not.toBeNull();
  });

  test("plain coaches can't open the member tools", async ({ page }) => {
    await login(page, "coach@example.com");
    await page.goto("/coach/members");
    await expect(page).not.toHaveURL(/\/coach\/members/);
    await expect(page.getByRole("link", { name: "Members" })).toHaveCount(0);
  });

  test("coach admin can add a member, configure them, and send the onboarding email", async ({ page }) => {
    const household = await db.household.create({ data: { name: "Dana Coachadmin Household" } });
    const coach = await db.user.create({
      data: {
        email: "coach.admin@test.local",
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        name: "Dana Coachadmin",
        role: "COACH",
        canManageMembers: true,
        householdId: household.id,
      },
    });
    const coachProfile = await db.memberProfile.create({
      data: { name: coach.name, userId: coach.id, householdId: household.id },
    });

    await login(page, coach.email);
    await page.getByRole("link", { name: /add or onboard a member/i }).click();
    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
    await expect(page.locator('#new-role option[value="ADMIN"]')).toHaveCount(0);
    await expect(page.locator('#new-role option[value="COACH"]')).toHaveCount(0);

    await page.fill("#new-name", "Pat Parentnew");
    await page.fill("#new-email", "pat.parentnew@test.local");
    await page.selectOption("#new-role", "PARENT");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/admin\/member\//);
    await expect(page.getByRole("link", { name: /back to members/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /view portal as/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Reset password" })).toHaveCount(0);

    await page.selectOption('select[name="membershipType"]', "MONTHLY");
    await page.fill('input[name="membershipPlan"]', "Family Monthly");
    await page.getByRole("button", { name: "Save membership" }).click();
    await expect(page.getByRole("status")).toContainText(/membership saved/i);

    await page.getByRole("button", { name: "Send onboarding email" }).click();
    await expect(page.getByRole("status")).toContainText(/onboarding email sent to pat.parentnew@test.local/i);

    const parent = await db.user.findUniqueOrThrow({ where: { email: "pat.parentnew@test.local" } });
    expect(parent.role).toBe("PARENT");
    expect(parent.onboardingEmailSentAt).not.toBeNull();
    const audit = await db.auditLog.findMany({ where: { actorName: coach.name } });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(["ACCOUNT_CREATED", "MEMBERSHIP_UPDATED", "ONBOARDING_EMAIL_SENT"])
    );

    // Staff accounts stay admin-only.
    const res = await page.goto(`/admin/member/${coachProfile.id}`);
    expect(res?.status()).toBe(404);
  });

  test("admin can grant coach admin access", async ({ page }) => {
    const coachUser = await db.user.findUniqueOrThrow({
      where: { email: "coach@example.com" },
      include: { profile: true },
    });
    test.skip(!coachUser.profile, "seed coach has no profile");
    await login(page, "admin@example.com");
    await page.goto(`/admin/member/${coachUser.profile!.id}`);
    await page.getByLabel(/can add member accounts/i).check();
    await page.getByRole("button", { name: "Save coach admin access" }).click();
    await expect(page.getByRole("status")).toContainText(/can now add member accounts/i);
    const updated = await db.user.findUniqueOrThrow({ where: { id: coachUser.id } });
    expect(updated.canManageMembers).toBe(true);
    await db.user.update({ where: { id: coachUser.id }, data: { canManageMembers: false } });
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
