import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { MAX_SEND_ATTEMPTS } from "@/lib/leads/messageStatus";
import { deliverOutbound, queueOutbound, retryOutbound, retryStuckOutbound, sendOutbound } from "@/lib/leads/outbox";
import type { SmsResult } from "@/lib/leads/sms";
import { makeBotConfig, makeLead, quietMoment, resetDb, sendableNow } from "./helpers/db";

/**
 * The provider is the one thing these tests must not reach, and the one thing whose failure they
 * care most about — so it is mocked rather than pointed at fake credentials.
 */
const provider = vi.hoisted(() => ({
  result: { ok: true, provider: "MOCK", providerId: "mock-1" } as SmsResult,
  calls: [] as { to: string; body: string }[],
}));

vi.mock("@/lib/leads/sms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/leads/sms")>();
  return {
    ...actual,
    sendSms: vi.fn(async (to: string, body: string) => {
      provider.calls.push({ to, body });
      return provider.result;
    }),
  };
});

function succeeds() {
  provider.result = { ok: true, provider: "MOCK", providerId: "mock-1" };
}

function fails(error = "Twilio error 30034: unregistered number") {
  provider.result = { ok: false, provider: "TWILIO", error };
}

describe("outbox", () => {
  beforeEach(async () => {
    await resetDb();
    // No quiet hours by default, so a suite run at 3am asserts the same thing as one run at noon.
    await makeBotConfig({ quietHoursStart: 0, quietHoursEnd: 0 });
    provider.calls = [];
    succeeds();
  });

  it("marks a delivered message SENT and advances the lead", async () => {
    const lead = await makeLead();
    const now = await sendableNow();
    const outcome = await sendOutbound({ leadId: lead.id, body: "Free class this week?", actor: "AUTOMATION" }, now);

    expect(outcome.status).toBe("SENT");
    expect(provider.calls).toHaveLength(1);
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.status).toBe("CONTACTED");
    expect(after.firstContactedAt).not.toBeNull();
    expect(after.lastOutboundAt).not.toBeNull();
  });

  it("keeps a rejected message on the thread instead of losing it", async () => {
    // The bug this whole state machine exists for: the send used to happen with the text held only
    // in a local variable, so a provider error dropped the coach's words entirely.
    fails();
    const lead = await makeLead();
    const outcome = await sendOutbound(
      { leadId: lead.id, body: "See you Wednesday!", actor: "STAFF" },
      await sendableNow(),
    );

    expect(outcome.status).toBe("FAILED");
    expect(outcome.status === "FAILED" && outcome.retryable).toBe(true);
    const stored = await prisma.leadMessage.findUniqueOrThrow({ where: { id: outcome.message.id } });
    expect(stored.body).toBe("See you Wednesday!");
    expect(stored.errorText).toContain("30034");
    expect(stored.attempts).toBe(1);
  });

  it("does not touch the lead's contact history when the send failed", async () => {
    fails();
    const lead = await makeLead();
    await sendOutbound({ leadId: lead.id, body: "Hi there", actor: "AUTOMATION" }, await sendableNow());
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.status).toBe("NEW");
    expect(after.firstContactedAt).toBeNull();
  });

  it("only lets one caller claim a message, so a double-clicked retry can't double-send", async () => {
    const lead = await makeLead();
    const now = await sendableNow();
    const queued = await queueOutbound({ leadId: lead.id, body: "Once only", actor: "STAFF" });

    const [first, second] = await Promise.all([deliverOutbound(queued.id, now), deliverOutbound(queued.id, now)]);
    const outcomes = [first.status, second.status].sort();
    expect(outcomes).toEqual(["CLAIMED_ELSEWHERE", "SENT"]);
    expect(provider.calls).toHaveLength(1);
  });

  it("recovers a message stranded mid-attempt by a crashed process", async () => {
    const lead = await makeLead();
    const now = await sendableNow();
    const queued = await queueOutbound({ leadId: lead.id, body: "Stranded", actor: "STAFF" });
    await prisma.leadMessage.update({
      where: { id: queued.id },
      data: { status: "SENDING", attempts: 1, lastAttemptAt: new Date(now.getTime() - 6 * 60_000) },
    });

    expect((await deliverOutbound(queued.id, now)).status).toBe("SENT");
  });

  it("leaves a fresh SENDING row alone", async () => {
    const lead = await makeLead();
    const now = await sendableNow();
    const queued = await queueOutbound({ leadId: lead.id, body: "In flight", actor: "STAFF" });
    await prisma.leadMessage.update({
      where: { id: queued.id },
      data: { status: "SENDING", attempts: 1, lastAttemptAt: new Date(now.getTime() - 30_000) },
    });

    expect((await deliverOutbound(queued.id, now)).status).toBe("CLAIMED_ELSEWHERE");
    expect(provider.calls).toHaveLength(0);
  });

  it("holds an automated send during quiet hours as PENDING, not as an error for staff", async () => {
    const config = await makeBotConfig({ quietHoursStart: 21, quietHoursEnd: 8 });
    const lead = await makeLead();
    const night = quietMoment(config);

    const outcome = await sendOutbound({ leadId: lead.id, body: "Late follow-up", actor: "AUTOMATION" }, night);
    expect(outcome.status).toBe("DEFERRED");
    expect(provider.calls).toHaveLength(0);

    const held = await prisma.leadMessage.findUniqueOrThrow({ where: { id: outcome.message.id } });
    expect(held.status).toBe("PENDING");
    // The attempt is given back, so a night of deferrals can't burn the retry budget.
    expect(held.attempts).toBe(0);

    // ...and it sends itself once the window lifts.
    const morning = await sendableNow(night);
    expect((await deliverOutbound(held.id, morning)).status).toBe("SENT");
  });

  it("blocks a validation failure before the provider is called", async () => {
    const lead = await makeLead({ optedOutAt: new Date() });
    const outcome = await sendOutbound({ leadId: lead.id, body: "One more thing", actor: "STAFF" }, await sendableNow());

    expect(outcome.status).toBe("BLOCKED");
    expect(provider.calls).toHaveLength(0);
    const events = await prisma.leadEvent.findMany({ where: { leadId: lead.id, type: "SEND_BLOCKED" } });
    expect(events).toHaveLength(1);
    // The text is preserved so staff can see what was held and why.
    expect(outcome.message.body).toBe("One more thing");
  });

  it("re-validates on retry, so retrying can never text someone who opted out", async () => {
    fails();
    const lead = await makeLead();
    const outcome = await sendOutbound({ leadId: lead.id, body: "Still there?", actor: "STAFF" }, await sendableNow());
    expect(outcome.status).toBe("FAILED");

    await prisma.lead.update({ where: { id: lead.id }, data: { optedOutAt: new Date() } });
    succeeds();
    const retried = await retryOutbound(outcome.message.id, "Coach Sikai", await sendableNow());

    expect(retried.status).toBe("BLOCKED");
    expect(provider.calls).toHaveLength(1); // only the original failed attempt
  });

  it("gives a hand-driven retry a fresh attempt budget and can succeed second time", async () => {
    fails();
    const lead = await makeLead();
    const outcome = await sendOutbound({ leadId: lead.id, body: "Try again", actor: "STAFF" }, await sendableNow());

    succeeds();
    const retried = await retryOutbound(outcome.message.id, "Coach Sikai", await sendableNow());
    expect(retried.status).toBe("SENT");
    const events = await prisma.leadEvent.findMany({ where: { leadId: lead.id, type: "SEND_RETRIED" } });
    expect(events).toHaveLength(1);
  });

  it("stops retrying a permanently rejecting provider instead of hammering it", async () => {
    fails();
    const lead = await makeLead();
    const now = await sendableNow();
    const queued = await queueOutbound({ leadId: lead.id, body: "Parked eventually", actor: "STAFF" });
    await prisma.leadMessage.update({
      where: { id: queued.id },
      data: { createdAt: new Date(now.getTime() - 5 * 60_000) },
    });

    for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS + 2; attempt += 1) {
      await retryStuckOutbound(now);
    }

    const message = await prisma.leadMessage.findUniqueOrThrow({ where: { id: queued.id } });
    expect(message.status).toBe("FAILED");
    expect(message.attempts).toBe(MAX_SEND_ATTEMPTS);
    expect(provider.calls).toHaveLength(MAX_SEND_ATTEMPTS);
  });

  it("picks up a message an earlier tick queued but never delivered", async () => {
    const lead = await makeLead();
    const now = await sendableNow();
    const queued = await queueOutbound({ leadId: lead.id, body: "Left queued", actor: "AUTOMATION" });
    await prisma.leadMessage.update({
      where: { id: queued.id },
      data: { createdAt: new Date(now.getTime() - 5 * 60_000) },
    });

    const summary = await retryStuckOutbound(now);
    expect(summary).toMatchObject({ considered: 1, sent: 1 });
  });

  it("ignores a message queued moments ago, whose own caller is still delivering it", async () => {
    const lead = await makeLead();
    const now = await sendableNow();
    await queueOutbound({ leadId: lead.id, body: "Just queued", actor: "AUTOMATION" });

    expect(await retryStuckOutbound(now)).toMatchObject({ considered: 0 });
  });
});
