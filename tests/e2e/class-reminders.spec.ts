import "./env-setup";
import { test, expect } from "@playwright/test";
import { runClassReminderPass } from "../../src/lib/reminders";
import type { PushPayload } from "../../src/lib/push";
import { createMember, db } from "./helpers";

async function makeSession(hoursFromNow: number, name = "Push Reminder Class") {
  const program = await db.program.upsert({
    where: { name: "Push Reminder Program" },
    update: {},
    create: { name: "Push Reminder Program", description: "test" },
  });
  const template = await db.classTemplate.create({
    data: { name, description: "test", programId: program.id },
  });
  return db.classSession.create({
    data: {
      templateId: template.id,
      startsAt: new Date(Date.now() + hoursFromNow * 60 * 60 * 1000),
      instructor: "Coach Test",
    },
  });
}

function stubSender() {
  const calls: { userIds: string[]; payload: PushPayload }[] = [];
  const send = async (userIds: string[], payload: PushPayload) => {
    calls.push({ userIds, payload });
    return userIds.length;
  };
  return { calls, send };
}

test.describe("booked-class push reminders", () => {
  test("24-hour and 2-hour windows fire once each, skipping cancelled/waitlisted/far bookings", async () => {
    const { user, profile } = await createMember("pushme@test.local", "Pat Pushed");

    const session23h = await makeSession(23);
    const session90m = await makeSession(1.5, "Push Soon Class");
    const session3h = await makeSession(3, "Push Between Class");
    const session72h = await makeSession(72, "Push Far Class");

    const booking24 = await db.booking.create({
      data: { profileId: profile.id, sessionId: session23h.id },
    });
    const booking2 = await db.booking.create({
      data: { profileId: profile.id, sessionId: session90m.id },
    });
    const bookingBetween = await db.booking.create({
      data: { profileId: profile.id, sessionId: session3h.id },
    });
    const bookingFar = await db.booking.create({
      data: { profileId: profile.id, sessionId: session72h.id },
    });

    const { profile: cancelled } = await createMember("pushnope@test.local", "Nina Notgoing");
    const cancelledBooking = await db.booking.create({
      data: { profileId: cancelled.id, sessionId: session23h.id, status: "CANCELLED" },
    });
    const { profile: waitlisted } = await createMember("pushwait@test.local", "Wanda Waiting");
    const waitlistedBooking = await db.booking.create({
      data: { profileId: waitlisted.id, sessionId: session90m.id, status: "WAITLISTED" },
    });

    // Mark unrelated (seeded) bookings as already reminded so counts are deterministic.
    const ourProfileIds = [profile.id, cancelled.id, waitlisted.id];
    await db.booking.updateMany({
      where: { profileId: { notIn: ourProfileIds } },
      data: { reminder24SentAt: new Date(), reminder2SentAt: new Date() },
    });

    const { calls, send } = stubSender();
    expect(await runClassReminderPass(db, send)).toBe(2);
    expect(calls).toHaveLength(2);

    const call24 = calls.find((c) => c.payload.title.includes("24 hours"));
    const call2 = calls.find((c) => c.payload.title.includes("2 hours"));
    expect(call24?.userIds).toEqual([user.id]);
    expect(call24?.payload.title).toContain("Push Reminder Class");
    expect(call24?.payload.body).toContain("Need to make a change? Do so right through the app.");
    expect(call2?.userIds).toEqual([user.id]);
    expect(call2?.payload.title).toContain("Push Soon Class");
    expect(call2?.payload.url).toBe("/schedule");

    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking24.id } })).reminder24SentAt
    ).not.toBeNull();
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking2.id } })).reminder2SentAt
    ).not.toBeNull();
    const between = await db.booking.findUniqueOrThrow({ where: { id: bookingBetween.id } });
    expect(between.reminder24SentAt).toBeNull();
    expect(between.reminder2SentAt).toBeNull();
    const far = await db.booking.findUniqueOrThrow({ where: { id: bookingFar.id } });
    expect(far.reminder24SentAt).toBeNull();
    expect(far.reminder2SentAt).toBeNull();
    const skippedCancelled = await db.booking.findUniqueOrThrow({
      where: { id: cancelledBooking.id },
    });
    expect(skippedCancelled.reminder24SentAt).toBeNull();
    const skippedWaitlisted = await db.booking.findUniqueOrThrow({
      where: { id: waitlistedBooking.id },
    });
    expect(skippedWaitlisted.reminder2SentAt).toBeNull();

    // Second pass is a no-op — no duplicate reminders.
    const second = stubSender();
    expect(await runClassReminderPass(db, second.send)).toBe(0);
    expect(second.calls).toHaveLength(0);
  });

  test("child bookings notify the household parents", async () => {
    const parent = await db.user.findFirstOrThrow({ where: { email: "parent@example.com" } });
    const kid = await db.memberProfile.findFirstOrThrow({
      where: { householdId: parent.householdId!, isChild: true },
    });
    await db.booking.deleteMany({ where: { profileId: kid.id } });
    const session = await makeSession(22, "Push Kids Class");
    const booking = await db.booking.create({
      data: { profileId: kid.id, sessionId: session.id },
    });

    const { calls, send } = stubSender();
    expect(await runClassReminderPass(db, send)).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].userIds).toContain(parent.id);
    expect(calls[0].payload.body).toContain(kid.name.split(" ")[0]);
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).reminder24SentAt
    ).not.toBeNull();
  });
});
