import { test, expect } from "@playwright/test";
import { db, login, createMember } from "./helpers";

function inDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function makeTrial(email: string, name: string, trialClassType: string, endsAt: Date) {
  const member = await createMember(email, name);
  await db.memberProfile.update({
    where: { id: member.profile.id },
    data: {
      membershipPlan: "Trial",
      membershipType: "TRIAL",
      membershipRenewsAt: endsAt,
      trialClassType,
    },
  });
  return member;
}

test.describe("trial accounts", () => {
  test("trial member sees the trial badge on home", async ({ page }) => {
    await makeTrial("trial-badge@test.local", "Tina Trial", "BOTH", inDays(7));
    await login(page, "trial-badge@test.local");
    await expect(page.getByText("Trial", { exact: true }).first()).toBeVisible();
  });

  test("private-only trial member is blocked from booking a group class", async ({ page }) => {
    const trial = await makeTrial("trial-private@test.local", "Priya Private", "PRIVATE", inDays(7));
    await login(page, "trial-private@test.local");
    await page.goto("/schedule");
    await page.getByRole("button", { name: /Book|Join waitlist/ }).first().click();
    await expect(page).toHaveURL(/error=/);
    await expect(page.getByRole("alert").first()).toBeVisible();
    const bookings = await db.booking.count({ where: { profileId: trial.profile.id } });
    expect(bookings).toBe(0);
  });

  test("expired trial member cannot book", async ({ page }) => {
    const trial = await makeTrial("trial-expired@test.local", "Eddie Expired", "BOTH", inDays(-2));
    await login(page, "trial-expired@test.local");
    await page.goto("/schedule");
    await page.getByRole("button", { name: /Book|Join waitlist/ }).first().click();
    await expect(page).toHaveURL(/error=/);
    await expect(page.getByRole("alert").first()).toBeVisible();
    const bookings = await db.booking.count({ where: { profileId: trial.profile.id } });
    expect(bookings).toBe(0);
  });

  test("admin booking forms respect the trial class type", async ({ page }) => {
    const groupOnly = await makeTrial("trial-group@test.local", "Greg Group", "GROUP", inDays(7));
    const privateOnly = await makeTrial("trial-priv2@test.local", "Pat Private", "PRIVATE", inDays(7));

    await login(page, "admin@example.com");

    await page.goto(`/admin/member/${groupOnly.profile.id}`);
    await expect(page.getByRole("button", { name: "Book group class" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Book private trial" })).toHaveCount(0);

    await page.goto(`/admin/member/${privateOnly.profile.id}`);
    await expect(page.getByRole("button", { name: "Book private trial" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Book group class" })).toHaveCount(0);
  });

  test("private trials outside 8am-8pm are rejected", async ({ page }) => {
    const trial = await makeTrial("trial-hours@test.local", "Holly Hours", "PRIVATE", inDays(7));
    await login(page, "admin@example.com");
    await page.goto(`/admin/member/${trial.profile.id}`);

    const date = inDays(3).toISOString().slice(0, 10);
    await page.fill('input[name="date"]', date);
    // 19:30 passes the input's client-side max, but +60 min runs past the 8 PM close.
    await page.fill('input[name="time"]', "19:30");
    await page.locator('select[name="duration"]').selectOption("60");
    await page.getByRole("button", { name: "Book private trial" }).click();
    await expect(page).toHaveURL(/error=/);
    await expect(page.getByRole("alert").first()).toContainText(/8:00 AM and 8:00 PM/);
    const bookings = await db.booking.count({ where: { profileId: trial.profile.id } });
    expect(bookings).toBe(0);
  });
});
