import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { validateOutbound } from "@/lib/leads/validate";
import { makeBotConfig, makeLead, makeSession, quietMoment, resetDb, sendableNow } from "./helpers/db";

/** The one gate every outbound message passes, whoever wrote it. */
describe("validateOutbound", () => {
  beforeEach(async () => {
    await resetDb();
    // No quiet hours by default, so a suite run at 3am asserts the same thing as one run at noon.
    await makeBotConfig({ quietHoursStart: 0, quietHoursEnd: 0 });
  });

  it("passes an ordinary staff message", async () => {
    const lead = await makeLead();
    const verdict = await validateOutbound({
      leadId: lead.id,
      body: "Hi Ana, this is the studio — want to come try a class?",
      actor: "STAFF",
      agentAuthored: false,
      now: await sendableNow(),
    });
    expect(verdict).toEqual({ ok: true });
  });

  it("refuses an empty body and an unknown lead", async () => {
    const lead = await makeLead();
    expect(await validateOutbound({ leadId: lead.id, body: "   ", actor: "STAFF", agentAuthored: false })).toMatchObject({ ok: false });
    expect(await validateOutbound({ leadId: "does-not-exist", body: "hi", actor: "STAFF", agentAuthored: false })).toMatchObject({ ok: false });
  });

  it("blocks every actor once the lead has opted out", async () => {
    const lead = await makeLead({ optedOutAt: new Date() });
    for (const actor of ["STAFF", "AUTOMATION"] as const) {
      const verdict = await validateOutbound({ leadId: lead.id, body: "One more thing", actor, agentAuthored: false });
      expect(verdict.ok).toBe(false);
      // An opt-out is permanent, so it must never come back as a deferral a later tick would send.
      expect(verdict.ok === false && verdict.defer).toBeFalsy();
    }
  });

  it("defers automation during quiet hours but lets a coach reply", async () => {
    const config = await makeBotConfig({ quietHoursStart: 21, quietHoursEnd: 8 });
    const lead = await makeLead();
    const night = quietMoment(config);

    const automated = await validateOutbound({ leadId: lead.id, body: "Following up!", actor: "AUTOMATION", agentAuthored: false, now: night });
    expect(automated).toMatchObject({ ok: false, defer: true });

    const staff = await validateOutbound({ leadId: lead.id, body: "Sorry for the late reply — yes, 6pm works.", actor: "STAFF", agentAuthored: false, now: night });
    expect(staff).toEqual({ ok: true });
  });

  it("rejects the same text twice inside the duplicate window, and allows it after", async () => {
    const lead = await makeLead();
    const now = await sendableNow();
    const body = "Want to come in Wednesday?";
    await prisma.leadMessage.create({
      data: { leadId: lead.id, direction: "OUTBOUND", body, status: "SENT", actor: "STAFF", createdAt: now },
    });

    expect(await validateOutbound({ leadId: lead.id, body, actor: "STAFF", agentAuthored: false, now })).toMatchObject({ ok: false });
    const later = new Date(now.getTime() + 11 * 60_000);
    expect(await validateOutbound({ leadId: lead.id, body, actor: "STAFF", agentAuthored: false, now: later })).toEqual({ ok: true });
  });

  it("does not count the row being delivered as a duplicate of itself", async () => {
    const lead = await makeLead();
    const now = await sendableNow();
    const message = await prisma.leadMessage.create({
      data: { leadId: lead.id, direction: "OUTBOUND", body: "On its way", status: "SENDING", actor: "STAFF", createdAt: now },
    });
    expect(
      await validateOutbound({
        leadId: lead.id,
        body: "On its way",
        actor: "STAFF",
        agentAuthored: false,
        excludeMessageId: message.id,
        now,
      }),
    ).toEqual({ ok: true });
  });

  it("refuses to send a booking for a class that is no longer on the schedule", async () => {
    const lead = await makeLead();
    const now = await sendableNow();
    const past = await makeSession({ startsAt: new Date(now.getTime() - 60_000) });
    const cancelled = await makeSession({ status: "CANCELLED" });

    for (const sessionId of [past.id, cancelled.id, "no-such-session"]) {
      const verdict = await validateOutbound({
        leadId: lead.id,
        body: "See you then!",
        actor: "STAFF",
        agentAuthored: false,
        proposedSessionId: sessionId,
        now,
      });
      expect(verdict.ok).toBe(false);
    }
  });

  it("blocks a message that names a different day than the class it books", async () => {
    const lead = await makeLead();
    const now = await sendableNow();
    // A Monday 6:15 PM class in studio time.
    const session = await makeSession({ startsAt: new Date("2027-01-05T00:15:00Z") });
    const monday = await validateOutbound({
      leadId: lead.id,
      body: "Booked you for Sunday at 6:15 PM.",
      actor: "STAFF",
      agentAuthored: false,
      proposedSessionId: session.id,
      now,
    });
    expect(monday.ok).toBe(false);
    expect(monday.ok === false && monday.reason).toContain("wrong day");

    const agreeing = await validateOutbound({
      leadId: lead.id,
      body: "Booked you in — see you then.",
      actor: "STAFF",
      agentAuthored: false,
      proposedSessionId: session.id,
      now,
    });
    expect(agreeing).toEqual({ ok: true });
  });

  it("holds agent-authored text to the knowledge base, including after a coach edits it", async () => {
    const lead = await makeLead({ ageGroup: "ADULT" });
    const now = await sendableNow();
    await prisma.knowledgeItem.create({
      data: { category: "PRICING", title: "Adult rates", body: "Adult unlimited is $175/month.", audience: "ADULTS", verified: true },
    });

    const invented = await validateOutbound({
      leadId: lead.id,
      body: "I can do $120/month for you.",
      actor: "STAFF",
      agentAuthored: true,
      now,
    });
    expect(invented.ok).toBe(false);
    expect(invented.ok === false && invented.reason).toContain("$120");

    const grounded = await validateOutbound({
      leadId: lead.id,
      body: "Adult unlimited is $175/month — want to try a class first?",
      actor: "STAFF",
      agentAuthored: true,
      now,
    });
    expect(grounded).toEqual({ ok: true });
  });

  it("ignores unverified knowledge, so a half-filled entry can't authorize a claim", async () => {
    const lead = await makeLead({ ageGroup: "ADULT" });
    await prisma.knowledgeItem.create({
      data: { category: "PRICING", title: "Draft rates", body: "Adult unlimited is $175/month.", audience: "ADULTS", verified: false },
    });
    const verdict = await validateOutbound({
      leadId: lead.id,
      body: "Adult unlimited is $175/month.",
      actor: "STAFF",
      agentAuthored: true,
      now: await sendableNow(),
    });
    expect(verdict.ok).toBe(false);
  });

  it("leaves hand-typed staff text unchecked against the knowledge base", async () => {
    // Deliberate: a coach may quote a rate they negotiated; the agent may not invent one.
    const lead = await makeLead({ ageGroup: "ADULT" });
    const verdict = await validateOutbound({
      leadId: lead.id,
      body: "For your family I can do $150/month.",
      actor: "STAFF",
      agentAuthored: false,
      now: await sendableNow(),
    });
    expect(verdict).toEqual({ ok: true });
  });
});
