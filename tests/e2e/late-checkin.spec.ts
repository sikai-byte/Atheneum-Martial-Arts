import "./env-setup";
import { test, expect } from "@playwright/test";
import { isLateCheckIn, LATE_BUFFER_MS } from "../../src/lib/attendance";
import { createMember, db, login } from "./helpers";

async function makeSession(minutesFromNow: number) {
  const program = await db.program.upsert({
    where: { name: "Late Test Program" },
    update: {},
    create: { name: "Late Test Program", description: "test" },
  });
  const template = await db.classTemplate.create({
    data: { name: `Late Test Class ${minutesFromNow}`, description: "test", programId: program.id },
  });
  return db.classSession.create({
    data: {
      templateId: template.id,
      startsAt: new Date(Date.now() + minutesFromNow * 60 * 1000),
      instructor: "Coach Test",
    },
  });
}

test.describe("late check-in flag", () => {
  test("isLateCheckIn applies a 5-minute buffer", () => {
    const start = new Date("2026-01-01T18:00:00Z");
    expect(isLateCheckIn(start, new Date(start.getTime() - 60 * 1000))).toBe(false);
    expect(isLateCheckIn(start, start)).toBe(false);
    expect(isLateCheckIn(start, new Date(start.getTime() + LATE_BUFFER_MS))).toBe(false);
    expect(isLateCheckIn(start, new Date(start.getTime() + LATE_BUFFER_MS + 1000))).toBe(true);
  });

  test("coach check-in after the buffer marks the attendance late", async ({ page }) => {
    const { profile } = await createMember("tardy@test.local", "Tara Tardy");
    const session = await makeSession(-20); // started 20 minutes ago
    await db.booking.create({ data: { profileId: profile.id, sessionId: session.id } });

    await login(page, "coach@example.com");
    await page.goto(`/coach/session/${session.id}`);
    await page.getByRole("button", { name: "Check in", exact: true }).first().click();
    await expect(page.getByText("Late", { exact: true })).toBeVisible();
    await expect(page.getByText("Checked in late")).toBeVisible();

    const attendance = await db.attendance.findUniqueOrThrow({
      where: { profileId_sessionId: { profileId: profile.id, sessionId: session.id } },
    });
    expect(attendance.late).toBe(true);
  });

  test("check-in within the buffer is not marked late", async ({ page }) => {
    const { profile } = await createMember("prompt@test.local", "Pat Prompt");
    const session = await makeSession(-3); // started 3 minutes ago — inside the buffer
    await db.booking.create({ data: { profileId: profile.id, sessionId: session.id } });

    await login(page, "coach@example.com");
    await page.goto(`/coach/session/${session.id}`);
    await page.getByRole("button", { name: "Check in", exact: true }).first().click();
    await expect(page.getByText("Adult member · Checked in", { exact: true })).toBeVisible();
    await expect(page.getByText("Late", { exact: true })).toHaveCount(0);

    const attendance = await db.attendance.findUniqueOrThrow({
      where: { profileId_sessionId: { profileId: profile.id, sessionId: session.id } },
    });
    expect(attendance.late).toBe(false);
  });

  test("check in all checks in every booked member at once", async ({ page }) => {
    const { profile: p1 } = await createMember("bulk1@test.local", "Bulk One");
    const { profile: p2 } = await createMember("bulk2@test.local", "Bulk Two");
    const { profile: p3 } = await createMember("bulk3@test.local", "Bulk Three");
    const session = await makeSession(-2); // started 2 minutes ago — inside the buffer
    for (const p of [p1, p2, p3]) {
      await db.booking.create({ data: { profileId: p.id, sessionId: session.id } });
    }

    await login(page, "coach@example.com");
    await page.goto(`/coach/session/${session.id}`);
    await page.getByRole("button", { name: "Check in all" }).click();
    await expect(page.getByText("Checked in 3 members.")).toBeVisible();
    await expect(page.getByText("3 of 3 checked in")).toBeVisible();
    await expect(page.getByRole("button", { name: "Check in all" })).toHaveCount(0);

    const attendances = await db.attendance.findMany({
      where: { sessionId: session.id },
    });
    expect(attendances).toHaveLength(3);
    expect(attendances.every((a) => !a.late)).toBe(true);
  });
});
