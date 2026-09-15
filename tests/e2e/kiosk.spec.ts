import "./env-setup";
import { test, expect } from "@playwright/test";
import { createMember, db, login } from "./helpers";
import bcrypt from "bcryptjs";

async function makeTodaySession(name: string) {
  const program = await db.program.upsert({
    where: { name: "Kiosk Test Program" },
    update: {},
    create: { name: "Kiosk Test Program", description: "test" },
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

test.describe("kiosk walk-in name suggestions", () => {
  test("typing part of a name suggests members and checks them in", async ({ page }) => {
    const { profile } = await createMember("kiosk-suggest@test.local", "Suggestme Walkin");
    await db.memberProfile.update({
      where: { id: profile.id },
      data: { pinHash: await bcrypt.hash("4321", 10) },
    });
    await createMember("kiosk-other@test.local", "Someoneelse Entirely");
    const session = await makeTodaySession("Kiosk Suggest Class");

    await login(page, "admin@example.com");
    await page.goto("/admin/kiosk");
    await page.getByRole("button", { name: "Turn on kiosk mode & open kiosk" }).click();
    await page.waitForURL((url) => url.pathname === "/kiosk");

    await page.goto(`/kiosk/${session.id}`);
    await page.getByRole("button", { name: "Not on the list? Check in by name" }).click();
    await page.getByLabel("Your name").fill("sugg");
    await expect(page.getByRole("button", { name: "Suggestme Walkin" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Someoneelse Entirely" })).toHaveCount(0);

    await page.getByRole("button", { name: "Suggestme Walkin" }).click();
    await expect(page.getByText("Suggestme Walkin")).toBeVisible();
    await page.getByLabel("Your 4-digit PIN").fill("4321");
    await page.getByRole("button", { name: "Check in", exact: true }).click();
    await expect(page.getByText("You're checked in, Suggestme!")).toBeVisible();

    const attendance = await db.attendance.findUnique({
      where: { profileId_sessionId: { profileId: profile.id, sessionId: session.id } },
    });
    expect(attendance).not.toBeNull();
  });
});
