import "./env-setup";
import { test, expect } from "@playwright/test";
import { runReminderPass } from "../../src/lib/reminders";
import { createMember, db } from "./helpers";

async function makeSession(hoursFromNow: number) {
  const program = await db.program.upsert({
    where: { name: "Reminder Test Program" },
    update: {},
    create: { name: "Reminder Test Program", description: "test" },
  });
  const template = await db.classTemplate.create({
    data: { name: "Reminder Test Class", description: "test", programId: program.id },
  });
  return db.classSession.create({
    data: {
      templateId: template.id,
      startsAt: new Date(Date.now() + hoursFromNow * 60 * 60 * 1000),
      instructor: "Coach Test",
    },
  });
}

function inDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function makeTrialMember(email: string, name: string) {
  const member = await createMember(email, name);
  await db.memberProfile.update({
    where: { id: member.profile.id },
    data: { membershipType: "TRIAL", membershipRenewsAt: inDays(7), trialStartedAt: new Date() },
  });
  return member;
}

test.describe("trial class reminder emails", () => {
  test("reminder pass emails trial bookings starting tomorrow exactly once", async () => {
    const { profile } = await makeTrialMember("remindme@test.local", "Rita Reminded");
    const soonSession = await makeSession(24);
    const farSession = await makeSession(72);
    const soonBooking = await db.booking.create({
      data: { profileId: profile.id, sessionId: soonSession.id },
    });
    const farBooking = await db.booking.create({
      data: { profileId: profile.id, sessionId: farSession.id },
    });

    // A cancelled trial booking in the window must not be reminded.
    const { profile: cancelled } = await makeTrialMember("nope@test.local", "Nina Notgoing");
    const cancelledBooking = await db.booking.create({
      data: { profileId: cancelled.id, sessionId: soonSession.id, status: "CANCELLED" },
    });

    // Non-trial members never get reminder emails.
    const { profile: regular } = await createMember("regular@test.local", "Ron Regular");
    const regularBooking = await db.booking.create({
      data: { profileId: regular.id, sessionId: soonSession.id },
    });

    const sent = await runReminderPass(db);
    expect(sent).toBe(1);

    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: soonBooking.id } })).reminderSentAt
    ).not.toBeNull();
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: farBooking.id } })).reminderSentAt
    ).toBeNull();
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: cancelledBooking.id } })).reminderSentAt
    ).toBeNull();
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: regularBooking.id } })).reminderSentAt
    ).toBeNull();

    // Second pass is a no-op — no duplicate reminders.
    expect(await runReminderPass(db)).toBe(0);
  });

  test("child trial bookings remind the household parents", async () => {
    const parent = await db.user.findFirstOrThrow({ where: { email: "parent@example.com" } });
    const kid = await db.memberProfile.findFirstOrThrow({
      where: { householdId: parent.householdId!, isChild: true },
    });
    await db.memberProfile.update({
      where: { id: kid.id },
      data: { membershipType: "TRIAL", membershipRenewsAt: inDays(7), trialStartedAt: new Date() },
    });
    const session = await makeSession(20);
    const booking = await db.booking.create({
      data: { profileId: kid.id, sessionId: session.id },
    });

    expect(await runReminderPass(db)).toBe(1);
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).reminderSentAt
    ).not.toBeNull();
  });
});
