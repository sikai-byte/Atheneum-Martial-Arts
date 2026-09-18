import "./env-setup";
import { test, expect } from "@playwright/test";
import { runLoginNudgePass, NUDGE_DATES } from "../../src/lib/loginNudges";
import { db } from "./helpers";

// 10:00 local on the first scheduled date. Chicago is UTC-5 in September.
const firstDate = new Date(`${NUDGE_DATES[0]}T15:30:00.000Z`);
const marker = `LOGIN_NUDGE:${NUDGE_DATES[0]}`;

test.describe("sign-in reminder emails", () => {
  test.beforeEach(async () => {
    await db.telemetryEvent.deleteMany({ where: { metadata: { startsWith: "LOGIN_NUDGE:" } } });
  });

  test("emails members who never signed in, once per scheduled date", async () => {
    const member = await db.user.findFirstOrThrow({ where: { email: "member@example.com" } });
    await db.telemetryEvent.deleteMany({ where: { type: "LOGIN", userId: member.id } });

    const sent = await runLoginNudgePass(db, firstDate);
    expect(sent).toBeGreaterThan(0);
    expect(await db.telemetryEvent.count({ where: { metadata: marker, userId: member.id } })).toBe(1);

    // Same date again is a no-op for everyone already emailed.
    expect(await runLoginNudgePass(db, firstDate)).toBe(0);
  });

  test("skips members who have signed in and does nothing off-schedule", async () => {
    const member = await db.user.findFirstOrThrow({ where: { email: "member@example.com" } });
    await db.telemetryEvent.create({ data: { type: "LOGIN", userId: member.id } });

    await runLoginNudgePass(db, firstDate);
    expect(await db.telemetryEvent.count({ where: { metadata: marker, userId: member.id } })).toBe(0);

    await db.telemetryEvent.deleteMany({ where: { metadata: { startsWith: "LOGIN_NUDGE:" } } });
    expect(await runLoginNudgePass(db, new Date("2026-09-21T15:30:00.000Z"))).toBe(0);
    expect(await runLoginNudgePass(db, new Date(`${NUDGE_DATES[0]}T13:00:00.000Z`))).toBe(0);
  });
});
