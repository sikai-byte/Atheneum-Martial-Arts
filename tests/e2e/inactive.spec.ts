import "./env-setup";
import { test, expect, Page } from "@playwright/test";
import { archiveLapsedMembers } from "../../src/lib/inactive";
import { createMember, db, login } from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

async function makeSession(name: string) {
  const program = await db.program.upsert({
    where: { name: "Inactive Test Program" },
    update: {},
    create: { name: "Inactive Test Program", description: "test" },
  });
  const template = await db.classTemplate.create({
    data: { name, description: "test", programId: program.id, ageGroup: "ADULTS" },
  });
  return db.classSession.create({
    data: {
      templateId: template.id,
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
      instructor: "Coach Test",
    },
  });
}

async function quickAddResults(page: Page, query: string) {
  await page.getByLabel("Search members").fill(query);
  await page.waitForTimeout(150);
  const items = await page.locator('[data-testid="quick-add-results"] li').allTextContents();
  return items.join("|");
}

test.describe("inactive/archive status", () => {
  test("admin can archive a member (sign-in kept, hidden from pickers) and reactivate", async ({
    page,
  }) => {
    const { profile } = await createMember("archie@test.local", "Archie Archived");
    const session = await makeSession("Inactive Adults Class");

    await login(page, "admin@example.com");
    await page.goto(`/admin/member/${profile.id}`);
    await page.getByRole("button", { name: "Move to inactive" }).click();
    await expect(page.getByRole("status")).toContainText(/inactive/i);

    const archived = await db.memberProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(archived.inactiveAt).not.toBeNull();
    expect(archived.deactivatedAt).toBeNull();

    // Inactive members are hidden from the coach add-to-class picker.
    await page.context().clearCookies();
    await login(page, "coach@example.com");
    await page.goto(`/coach/session/${session.id}`);
    expect(await quickAddResults(page, "Archie")).not.toContain("Archie Archived");

    // Inactive members can still sign in (they see the re-up notice, nothing is deleted).
    await page.context().clearCookies();
    await login(page, "archie@test.local");
    await expect(page).toHaveURL(/\/$/);

    // Reactivation puts them back.
    await page.context().clearCookies();
    await login(page, "admin@example.com");
    await page.goto(`/admin/member/${profile.id}`);
    await page.getByRole("button", { name: /back to active/ }).click();
    await expect(page.getByRole("status")).toContainText(/active again/i);

    const restored = await db.memberProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(restored.inactiveAt).toBeNull();

    const actions = (await db.auditLog.findMany({ where: { targetId: profile.id } })).map(
      (a) => a.action
    );
    expect(actions).toContain("MEMBER_ARCHIVED");
    expect(actions).toContain("MEMBER_UNARCHIVED");
  });

  test("members lapsed 30+ days are auto-archived; recent and staff are not", async () => {
    const lapsed = await createMember("lapsed@test.local", "Larry Lapsed");
    await db.memberProfile.update({
      where: { id: lapsed.profile.id },
      data: {
        membershipType: "MONTHLY",
        membershipPlan: "Adult Monthly",
        membershipRenewsAt: new Date(Date.now() - 40 * DAY_MS),
      },
    });
    const recent = await createMember("recent@test.local", "Rita Recent");
    await db.memberProfile.update({
      where: { id: recent.profile.id },
      data: {
        membershipType: "MONTHLY",
        membershipPlan: "Adult Monthly",
        membershipRenewsAt: new Date(Date.now() - 10 * DAY_MS),
      },
    });
    const staff = await createMember("staffer@test.local", "Steve Staff");
    await db.memberProfile.update({
      where: { id: staff.profile.id },
      data: { membershipType: "STAFF", membershipPlan: "Staff", membershipRenewsAt: null },
    });

    // History that must survive archiving.
    const attendance = await db.attendance.create({
      data: {
        profileId: lapsed.profile.id,
        sessionId: (await makeSession("History Class")).id,
        recordedBy: "Coach Test",
      },
    });

    const archived = await archiveLapsedMembers(db);
    expect(archived).toBeGreaterThanOrEqual(1);

    const lapsedProfile = await db.memberProfile.findUniqueOrThrow({
      where: { id: lapsed.profile.id },
    });
    expect(lapsedProfile.inactiveAt).not.toBeNull();
    expect(lapsedProfile.deactivatedAt).toBeNull();

    const recentProfile = await db.memberProfile.findUniqueOrThrow({
      where: { id: recent.profile.id },
    });
    expect(recentProfile.inactiveAt).toBeNull();
    const staffProfile = await db.memberProfile.findUniqueOrThrow({
      where: { id: staff.profile.id },
    });
    expect(staffProfile.inactiveAt).toBeNull();

    // Nothing deleted: history stays.
    expect(await db.attendance.findUnique({ where: { id: attendance.id } })).not.toBeNull();

    // Idempotent: a second sweep archives nothing new.
    const before = lapsedProfile.inactiveAt;
    expect(await archiveLapsedMembers(db)).toBe(0);
    const after = await db.memberProfile.findUniqueOrThrow({ where: { id: lapsed.profile.id } });
    expect(after.inactiveAt?.getTime()).toBe(before?.getTime());

    const auditActions = (
      await db.auditLog.findMany({ where: { targetId: lapsed.profile.id } })
    ).map((a) => a.action);
    expect(auditActions).toContain("MEMBER_ARCHIVED");
  });

  test("saving a current membership reactivates an inactive member", async ({ page }) => {
    const { profile } = await createMember("reup@test.local", "Renee Reup");
    await db.memberProfile.update({
      where: { id: profile.id },
      data: {
        membershipType: "MONTHLY",
        membershipPlan: "Adult Monthly",
        membershipRenewsAt: new Date(Date.now() - 40 * DAY_MS),
        inactiveAt: new Date(),
      },
    });

    await login(page, "admin@example.com");
    await page.goto(`/admin/member/${profile.id}`);
    const future = new Date(Date.now() + 30 * DAY_MS).toISOString().slice(0, 10);
    await page.fill('input[name="membershipRenewsAt"]', future);
    await page.getByRole("button", { name: "Save membership" }).click();
    await expect(page.getByRole("status")).toBeVisible();

    const updated = await db.memberProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(updated.inactiveAt).toBeNull();
  });
});
