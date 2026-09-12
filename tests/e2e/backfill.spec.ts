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

    await page.locator("#add-member").selectOption(profile.id);
    await page.getByRole("button", { name: "Add to class" }).click();
    await expect(page.getByText("Frank Forgot added to the class.")).toBeVisible();

    const booking = await db.booking.findUniqueOrThrow({
      where: { profileId_sessionId: { profileId: profile.id, sessionId: session.id } },
    });
    expect(booking.status).toBe("BOOKED");

    await page.getByRole("button", { name: "Check in", exact: true }).first().click();
    await expect(page.getByText("Adult member · Checked in", { exact: true })).toBeVisible();
    await expect(page.getByText("Late", { exact: true })).toHaveCount(0);

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
