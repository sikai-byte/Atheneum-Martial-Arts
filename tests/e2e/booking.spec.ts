import { test, expect, Page } from "@playwright/test";
import { db, login, createMember } from "./helpers";

function classCard(page: Page, className: string) {
  return page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: className, exact: true }) })
    .first();
}

test.describe("booking & waitlist", () => {
  test("member can book and cancel a class", async ({ page }) => {
    const { profile } = await createMember("booker@test.local", "Bobbie Booker");

    await login(page, "booker@test.local");
    await page.goto("/schedule");

    const card = classCard(page, "Gi BJJ");
    await card.getByRole("button", { name: "Book", exact: true }).click();
    await expect(card.getByText("You: booked")).toBeVisible();

    const booking = await db.booking.findFirst({
      where: { profileId: profile.id, status: "BOOKED" },
    });
    expect(booking).not.toBeNull();

    await card.getByRole("button", { name: "Cancel" }).click();
    await expect(card.getByRole("button", { name: "Book", exact: true })).toBeVisible();
    const cancelled = await db.booking.findFirst({ where: { profileId: profile.id } });
    expect(cancelled?.status).toBe("CANCELLED");
  });

  test("full class waitlists new bookings and promotes on cancellation", async ({ page, browser }) => {
    // Shrink a class so its booking limit (capacity + overbook buffer) is 4.
    const template = await db.classTemplate.findFirstOrThrow({
      where: { name: "Cardio Kickboxing" },
    });
    await db.classTemplate.update({ where: { id: template.id }, data: { capacity: 0 } });
    const session = await db.classSession.findFirstOrThrow({
      where: { templateId: template.id, startsAt: { gt: new Date() }, status: "SCHEDULED" },
      orderBy: { startsAt: "asc" },
    });

    // Fill the class with 4 fixture members (one booked via DB per member).
    const fillers = [];
    for (let i = 0; i < 4; i++) {
      const filler = await createMember(`filler${i}@test.local`, `Filler Member ${i}`);
      fillers.push(filler);
      await db.booking.create({
        data: { profileId: filler.profile.id, sessionId: session.id, status: "BOOKED" },
      });
    }

    // A 5th member sees "Join waitlist" and lands on the waitlist.
    const late = await createMember("latecomer@test.local", "Larry Latecomer");
    await login(page, "latecomer@test.local");
    await page.goto("/schedule");
    const card = classCard(page, "Cardio Kickboxing");
    await expect(card.getByText("Class full")).toBeVisible();
    await card.getByRole("button", { name: "Join waitlist" }).click();
    await expect(card.getByText("You: on the waitlist")).toBeVisible();

    const waitlisted = await db.booking.findUniqueOrThrow({
      where: { profileId_sessionId: { profileId: late.profile.id, sessionId: session.id } },
    });
    expect(waitlisted.status).toBe("WAITLISTED");

    // A booked member cancelling promotes the earliest waitlisted booking.
    const cancellerPage = await (await browser.newContext()).newPage();
    await login(cancellerPage, "filler0@test.local");
    await cancellerPage.goto("/schedule");
    const cancellerCard = classCard(cancellerPage, "Cardio Kickboxing");
    await cancellerCard.getByRole("button", { name: "Cancel" }).click();
    await expect(cancellerCard.getByRole("button", { name: /Book|Join waitlist/ })).toBeVisible();
    await cancellerPage.context().close();

    const promoted = await db.booking.findUniqueOrThrow({
      where: { profileId_sessionId: { profileId: late.profile.id, sessionId: session.id } },
    });
    expect(promoted.status).toBe("BOOKED");

    const promotionEvent = await db.telemetryEvent.findFirst({
      where: { type: "WAITLIST_PROMOTION", profileId: late.profile.id },
    });
    expect(promotionEvent).not.toBeNull();
  });

  test("booking the same class twice does not create a duplicate", async ({ page }) => {
    await createMember("doubler@test.local", "Dana Doubler");
    await login(page, "doubler@test.local");
    await page.goto("/schedule");
    const card = classCard(page, "Judo");
    await card.getByRole("button", { name: "Book", exact: true }).click();
    await expect(card.getByText("You: booked")).toBeVisible();
    // Once booked the card only offers Cancel — no second Book button.
    await expect(card.getByRole("button", { name: "Book", exact: true })).toHaveCount(0);
  });
});
