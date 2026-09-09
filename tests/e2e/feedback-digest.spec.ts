import "./env-setup";
import { test, expect } from "@playwright/test";
import { runFeedbackDigestPass } from "../../src/lib/feedbackDigest";
import { db } from "./helpers";

const MARKER = "FEEDBACK_WEEKLY_SUMMARY";

test.describe("weekly feedback digest", () => {
  test("sends at most one summary per week and records a marker", async () => {
    await db.telemetryEvent.deleteMany({ where: { metadata: MARKER } });
    const member = await db.user.findFirstOrThrow({ where: { email: "member@example.com" } });
    await db.feedback.create({
      data: { userId: member.id, message: "Digest test feedback" },
    });

    expect(await runFeedbackDigestPass(db)).toBe(true);
    expect(
      await db.telemetryEvent.count({ where: { metadata: MARKER } })
    ).toBe(1);

    // Second pass within the same week is a no-op.
    expect(await runFeedbackDigestPass(db)).toBe(false);
    expect(
      await db.telemetryEvent.count({ where: { metadata: MARKER } })
    ).toBe(1);

    // A marker older than a week allows the next summary.
    await db.telemetryEvent.updateMany({
      where: { metadata: MARKER },
      data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });
    expect(await runFeedbackDigestPass(db)).toBe(true);
  });
});
