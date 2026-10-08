import "./env-setup";
import { test, expect } from "@playwright/test";
import { createMember, db, login } from "./helpers";

async function makePastSession(minutesAgo: number) {
  const program = await db.program.upsert({
    where: { name: "Backfill Test Program" },
    update: {},
    create: { name: "Backfill Test Program", description: "test" },
  });
  const template = await db.classTemplate.create({
    data: {
      name: `Backfill Test Class ${minutesAgo}`,
      description: "test",
      programId: program.id,
    },
  });
  return db.classSession.create({
    data: {
      templateId: template.id,
      startsAt: new Date(Date.now() - minutesAgo * 60 * 1000),
      instructor: "Coach Test",
    },
  });
}

test.describe("retroactive check-in for past classes", () => {
  test("coach can add a member to an ended class and check them in without a late flag", async ({
    page,
  }) => {
    const { profile } = await createMember("forgot@test.local", "Frank Forgot");
    const session = await makePastSession(240); // ended hours ago

    await login(page, "coach@example.com");
    await page.goto(`/coach/session/${session.id}`);
    await expect(page.getByText("This class has ended")).toBeVisible();

    await page.getByLabel("Search members").fill("Frank Forgot");
    await page
      .locator('[data-testid="quick-add-results"] li', { hasText: "Frank Forgot" })
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await expect(page.getByText("Frank Forgot added to the class.")).toBeVisible();
    await expect(page.getByLabel("Search members")).toHaveValue("");

    const booking = await db.booking.findUniqueOrThrow({
      where: { profileId_sessionId: { profileId: profile.id, sessionId: session.id } },
    });
    expect(booking.status).toBe("BOOKED");

    const rosterRow = page
      .locator("li", { hasText: "Frank Forgot" })
      .filter({ hasText: "Not checked in" });
    await rosterRow.getByRole("button", { name: "Check in", exact: true }).click();
    await expect(page.getByText("Adult member · Checked in", { exact: true })).toBeVisible();
    await expect(page.getByText("Late", { exact: true })).toHaveCount(0);

    const attendance = await db.attendance.findUniqueOrThrow({
      where: { profileId_sessionId: { profileId: profile.id, sessionId: session.id } },
    });
    expect(attendance.late).toBe(false);
  });

  test("one tap adds and checks in a member, clearing the search", async ({ page }) => {
    const { profile } = await createMember("onetap@test.local", "Olivia Onetap");
    const session = await makePastSession(240);

    await login(page, "coach@example.com");
    await page.goto(`/coach/session/${session.id}`);

    await page.getByLabel("Search members").fill("Olivia Onetap");
    await page
      .locator('[data-testid="quick-add-results"] li', { hasText: "Olivia Onetap" })
      .getByRole("button", { name: "Check in" })
      .click();
    await expect(page.getByText("Olivia Onetap checked in.")).toBeVisible();
    await expect(page.getByLabel("Search members")).toHaveValue("");
    await expect(page.getByText("Adult member · Checked in", { exact: true })).toBeVisible();

    const booking = await db.booking.findUniqueOrThrow({
      where: { profileId_sessionId: { profileId: profile.id, sessionId: session.id } },
    });
    expect(booking.status).toBe("BOOKED");
    const attendance = await db.attendance.findUniqueOrThrow({
      where: { profileId_sessionId: { profileId: profile.id, sessionId: session.id } },
    });
    expect(attendance.late).toBe(false);
  });

  test("past classes appear on the coach dashboard", async ({ page }) => {
    const session = await makePastSession(60 * 26); // yesterday
    const template = await db.classTemplate.findUniqueOrThrow({
      where: { id: session.templateId },
    });

    await login(page, "coach@example.com");
    await page.goto("/coach");
    await expect(page.getByText("Past classes (last 2 weeks)")).toBeVisible();
    await expect(page.getByText(template.name)).toBeVisible();
  });
});
