import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  approveAgentDraft,
  enrollLead,
  handleInboundSms,
  LeadInputError,
  NEW_LEAD_SEQUENCE,
} from "@/lib/leads/engine";
import type { SmsResult } from "@/lib/leads/sms";
import { makeBotConfig, makeLead, makeSequence, makeSession, resetDb } from "./helpers/db";

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

describe("handleInboundSms", () => {
  beforeEach(async () => {
    await resetDb();
    // Auto-reply off: these tests are about what an inbound text does to the lead's state, and the
    // agent's own reply has its own coverage.
    await makeBotConfig({ quietHoursStart: 0, quietHoursEnd: 0, autoReplyEnabled: false });
    await makeSequence(NEW_LEAD_SEQUENCE);
    provider.calls = [];
  });

  it("ignores a text from a number that is not a lead", async () => {
    expect(await handleInboundSms("+16125550000", "hello?")).toEqual({ matched: false });
    expect(await handleInboundSms("nonsense", "hello?")).toEqual({ matched: false });
  });

  it("matches a lead however the provider formats the number", async () => {
    const lead = await makeLead({ phone: "+16125583765" });
    const result = await handleInboundSms("(612) 558-3765", "Sounds good");
    expect(result.matched).toBe(true);
    const stored = await prisma.leadMessage.findFirstOrThrow({ where: { leadId: lead.id, direction: "INBOUND" } });
    expect(stored).toMatchObject({ body: "Sounds good", status: "RECEIVED" });
  });

  it("stops the drip when a lead replies, without treating the reply as a lost lead", async () => {
    const lead = await makeLead();
    await enrollLead(lead.id, NEW_LEAD_SEQUENCE);
    expect(await prisma.followUpTask.count({ where: { leadId: lead.id, status: "PENDING" } })).toBeGreaterThan(0);

    await handleInboundSms(lead.phone, "What times do you have Wednesday?");

    expect(await prisma.followUpTask.count({ where: { leadId: lead.id, status: "PENDING" } })).toBe(0);
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.status).toBe("ENGAGED");
    expect(after.pausedAt).not.toBeNull();
    expect(after.lastInboundAt).not.toBeNull();
    const events = await prisma.leadEvent.findMany({ where: { leadId: lead.id } });
    expect(events.map((e) => e.type)).toContain("PAUSED");
  });

  it("does not demote a lead who already booked or joined", async () => {
    for (const status of ["BOOKED", "WON", "LOST"]) {
      const lead = await makeLead({ status });
      await handleInboundSms(lead.phone, "See you then");
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe(status);
    }
  });

  it("treats STOP as a permanent opt-out and answers nothing back", async () => {
    const lead = await makeLead();
    await enrollLead(lead.id, NEW_LEAD_SEQUENCE);

    const result = await handleInboundSms(lead.phone, "STOP");
    expect(result).toMatchObject({ matched: true, optedOut: true, autoReplied: false });
    expect(provider.calls).toHaveLength(0);

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.optedOutAt).not.toBeNull();
    expect(after.status).toBe("UNSUBSCRIBED");
    expect(await prisma.followUpTask.count({ where: { leadId: lead.id, status: "PENDING" } })).toBe(0);
  });

  it("reads the opt-out words a real person types", async () => {
    for (const text of ["stop", "  Stop.  ", "UNSUBSCRIBE", "cancel", "stop please", "Quit!"]) {
      const lead = await makeLead();
      await handleInboundSms(lead.phone, text);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).optedOutAt).not.toBeNull();
    }
  });

  it("does not opt out a lead who used a stop word inside a sentence", async () => {
    const lead = await makeLead();
    await handleInboundSms(lead.phone, "Can I stop by on Wednesday to watch a class?");
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.optedOutAt).toBeNull();
    expect(after.status).toBe("ENGAGED");
  });
});

describe("approveAgentDraft", () => {
  beforeEach(async () => {
    await resetDb();
    await makeBotConfig({ quietHoursStart: 0, quietHoursEnd: 0 });
    provider.calls = [];
    provider.result = { ok: true, provider: "MOCK", providerId: "mock-1" };
  });

  async function makeDraft(body: string, proposedSessionId?: string) {
    const lead = await makeLead({ ageGroup: "ADULT" });
    const draft = await prisma.leadMessage.create({
      data: {
        leadId: lead.id,
        direction: "OUTBOUND",
        body,
        status: "DRAFT",
        actor: "AUTOMATION",
        automated: true,
        agentAuthored: true,
        proposedSessionId: proposedSessionId ?? null,
      },
    });
    return { lead, draft };
  }

  it("sends an approved draft and books the class it proposed", async () => {
    const session = await makeSession();
    const { lead, draft } = await makeDraft("Got you a spot — see you then!", session.id);

    await approveAgentDraft(draft.id, "Coach Sikai");

    const sent = await prisma.leadMessage.findUniqueOrThrow({ where: { id: draft.id } });
    expect(sent.status).toBe("SENT");
    expect(sent.sentBy).toBe("Coach Sikai");
    expect(await prisma.trialBooking.count({ where: { leadId: lead.id, sessionId: session.id } })).toBe(1);
  });

  it("holds a coach's edit to the same fact checks the agent's own words face", async () => {
    await prisma.knowledgeItem.create({
      data: { category: "PRICING", title: "Adult rates", body: "Adult unlimited is $175/month.", audience: "ADULTS", verified: true },
    });
    const { draft } = await makeDraft("A coach will confirm pricing with you.");

    await expect(approveAgentDraft(draft.id, "Coach Sikai", "For you I can do $120/month.")).rejects.toThrow(
      LeadInputError,
    );
    expect(provider.calls).toHaveLength(0);
    // The words stay on the thread rather than vanishing on rejection.
    const after = await prisma.leadMessage.findUniqueOrThrow({ where: { id: draft.id } });
    expect(after.body).toBe("For you I can do $120/month.");
    expect(after.status).toBe("BLOCKED");
  });

  it("keeps a provider-rejected draft on the thread as retryable", async () => {
    provider.result = { ok: false, provider: "TWILIO", error: "Twilio error 30034" };
    const { draft } = await makeDraft("Thanks — a coach will follow up shortly.");

    await expect(approveAgentDraft(draft.id, "Coach Sikai")).rejects.toThrow(LeadInputError);
    const after = await prisma.leadMessage.findUniqueOrThrow({ where: { id: draft.id } });
    expect(after.status).toBe("FAILED");
    expect(after.body).toBe("Thanks — a coach will follow up shortly.");
  });

  it("refuses to approve the same draft twice", async () => {
    const { draft } = await makeDraft("Only once");
    await approveAgentDraft(draft.id, "Coach Sikai");
    await expect(approveAgentDraft(draft.id, "Coach Sikai")).rejects.toThrow(LeadInputError);
    expect(provider.calls).toHaveLength(1);
  });
});
