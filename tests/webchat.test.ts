import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { LeadInputError } from "@/lib/leads/engine";
import { SMS_CONSENT_TEXT, aiRepliesToday, inferAgeGroup } from "@/lib/leads/webchat";
import {
  captureWebChatContact,
  hashIp,
  replyToVisitor,
  startWebChat,
  webChatWithMessages,
} from "@/lib/leads/webchatFlow";
import {
  MAX_CHATS_PER_IP_PER_HOUR,
  checkMessageLimit,
  checkStartLimit,
  corsHeaders,
} from "@/lib/leads/webchatLimits";
import { makeBotConfig, makeSequence, resetDb } from "./helpers/db";

/**
 * The website bot is the first thing in this app the internet can reach without a login, so these
 * tests are about the two ways it could hurt the studio: texting somebody who never agreed to be
 * texted, and letting a stranger spend the model budget.
 *
 * No LLM key is set in .env.test, so the engine runs its rules path — which is also the path a
 * production outage takes, and it must still leave the visitor a way to reach a coach.
 */

const sms = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@/lib/leads/sms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/leads/sms")>();
  return { ...actual, sendSms: sms.send };
});

beforeEach(async () => {
  await resetDb();
  sms.send.mockReset();
  sms.send.mockResolvedValue({ sid: "test", provider: "MOCK" });
  await makeBotConfig({ coachAlertPhone: "+16125550123", webChatMaxTurns: 30 });
  await makeSequence("NEW_LEAD");
});

describe("starting a chat", () => {
  it("greets the visitor and never stores their raw IP", async () => {
    const { chat, greeting } = await startWebChat({
      pageUrl: "https://atheneummartialarts.com/",
      ip: "203.0.113.9",
    });

    expect(greeting).not.toBe("");
    expect(chat.ipHash).toBe(hashIp("203.0.113.9"));
    expect(chat.ipHash).not.toContain("203.0.113.9");
    expect(chat.leadId).toBeNull();

    const stored = await webChatWithMessages(chat.id);
    expect(stored?.messages).toHaveLength(1);
    expect(stored?.messages[0].role).toBe("BOT");
  });

  it("keeps an anonymous transcript, since there is no lead to hang it off yet", async () => {
    const { chat } = await startWebChat({});
    await replyToVisitor(chat.id, "Do you have classes for my 6 year old?");

    const stored = await webChatWithMessages(chat.id);
    expect(stored?.messages.map((m) => m.role)).toEqual(["BOT", "VISITOR", "BOT"]);
    expect(stored?.ageGroup).toBe("KID");
    expect(stored?.leadId).toBeNull();
    expect(await prisma.lead.count()).toBe(0);
  });

  it("texts nobody just because somebody opened the widget", async () => {
    const { chat } = await startWebChat({ ip: "203.0.113.9" });
    await replyToVisitor(chat.id, "What time is BJJ?");
    expect(sms.send).not.toHaveBeenCalled();
  });

  it("rejects an empty message", async () => {
    const { chat } = await startWebChat({});
    await expect(replyToVisitor(chat.id, "   ")).rejects.toBeInstanceOf(LeadInputError);
  });

  it("truncates an oversized message rather than storing it whole", async () => {
    const { chat } = await startWebChat({});
    await replyToVisitor(chat.id, "a".repeat(5_000));
    const stored = await webChatWithMessages(chat.id);
    const visitor = stored?.messages.find((m) => m.role === "VISITOR");
    expect(visitor?.body).toHaveLength(1_000);
  });
});

describe("what the bot is allowed to say", () => {
  it("hands price haggling to a coach instead of negotiating", async () => {
    const { chat } = await startWebChat({});
    const turn = await replyToVisitor(chat.id, "Can you do $120/month? That's my budget.");

    expect(turn.reply.action).toBe("HANDOFF");
    expect(turn.reply.body).not.toMatch(/\$\s?\d/);
    expect(turn.askForContact).toBe(true);
    const stored = await webChatWithMessages(chat.id);
    expect(stored?.status).toBe("HANDOFF");
    expect(stored?.handoffAt).not.toBeNull();
    expect(stored?.handoffReason).not.toBe("");
  });

  it("quotes no rate when asked the price with no model available", async () => {
    const { chat } = await startWebChat({});
    const turn = await replyToVisitor(chat.id, "How much is a monthly membership?");

    expect(turn.reply.generatedBy).toBe("RULES");
    expect(turn.reply.body).not.toMatch(/\$\s?\d/);
    expect(turn.reply.body.toLowerCase()).toContain("coach");
  });

  it("leaves a route to a human rather than erroring when there is no model", async () => {
    const { chat } = await startWebChat({});
    const turn = await replyToVisitor(chat.id, "Is Judo good for a nervous kid?");
    expect(["CAPTURE", "HANDOFF"]).toContain(turn.reply.action);
    expect(turn.reply.body).not.toBe("");
  });

  it("does not alert a coach about a visitor nobody can call back", async () => {
    const { chat } = await startWebChat({});
    await replyToVisitor(chat.id, "This is ridiculous, can you do a cheaper deal?");
    expect(sms.send).not.toHaveBeenCalled();
  });
});

describe("inferAgeGroup", () => {
  it("reads a child from what the visitor says", () => {
    expect(inferAgeGroup("my son is 7 years old", "UNKNOWN")).toBe("KID");
  });

  it("reads an adult training themselves", () => {
    expect(inferAgeGroup("I want to get in shape", "UNKNOWN")).toBe("ADULT");
  });

  it("never overwrites what we already established", () => {
    expect(inferAgeGroup("I want to get in shape", "KID")).toBe("KID");
  });
});

describe("contact capture and consent", () => {
  it("creates a lead and starts follow-up only when consent was ticked", async () => {
    const { chat } = await startWebChat({ pageUrl: "https://atheneummartialarts.com/kids/" });
    await replyToVisitor(chat.id, "Can my daughter try a class?");

    const updated = await captureWebChatContact({
      chatId: chat.id,
      name: "Dana",
      phone: "612-555-0144",
      smsConsent: true,
    });

    expect(updated.status).toBe("CAPTURED");
    expect(updated.consentAt).not.toBeNull();
    expect(updated.consentText).toBe(SMS_CONSENT_TEXT);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: updated.leadId ?? "" } });
    expect(lead.source).toBe("WEBSITE");
    expect(lead.formName).toBe("Website chat");
    expect(await prisma.followUpTask.count({ where: { leadId: lead.id } })).toBeGreaterThan(0);
  });

  it("creates the lead but queues nothing when consent was not ticked", async () => {
    const { chat } = await startWebChat({});
    await replyToVisitor(chat.id, "What time is Muay Thai?");

    const updated = await captureWebChatContact({
      chatId: chat.id,
      name: "Sam",
      phone: "612-555-0155",
      smsConsent: false,
    });

    expect(updated.consentAt).toBeNull();
    expect(updated.consentText).toBe("");
    const leadId = updated.leadId ?? "";
    expect(await prisma.followUpTask.count({ where: { leadId } })).toBe(0);
    expect(sms.send).not.toHaveBeenCalled();
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.sequenceKey).toBeNull();
  });

  it("treats a ticked box with no number as no consent", async () => {
    const { chat } = await startWebChat({});
    await replyToVisitor(chat.id, "Do you have adult beginners?");

    const updated = await captureWebChatContact({
      chatId: chat.id,
      name: "Alex",
      email: "alex@example.com",
      smsConsent: true,
    });

    expect(updated.consentAt).toBeNull();
    expect(updated.leadId).toBeNull();
    expect(updated.status).toBe("HANDOFF");
    expect(await prisma.lead.count()).toBe(0);
  });

  it("refuses to invent a lead with no way to reach anyone", async () => {
    const { chat } = await startWebChat({});
    await expect(
      captureWebChatContact({ chatId: chat.id, name: "Nobody", smsConsent: false }),
    ).rejects.toBeInstanceOf(LeadInputError);
  });

  it("refuses a name-less capture", async () => {
    const { chat } = await startWebChat({});
    await expect(
      captureWebChatContact({ chatId: chat.id, name: " ", phone: "612-555-0166", smsConsent: true }),
    ).rejects.toBeInstanceOf(LeadInputError);
  });

  it("refuses a phone number that cannot be called", async () => {
    const { chat } = await startWebChat({});
    await expect(
      captureWebChatContact({ chatId: chat.id, name: "Jo", phone: "12", smsConsent: true }),
    ).rejects.toBeInstanceOf(LeadInputError);
  });

  it("carries an anonymous handoff onto the lead once there is somebody to call", async () => {
    const { chat } = await startWebChat({});
    await replyToVisitor(chat.id, "Any chance of a discount for two kids?");

    const updated = await captureWebChatContact({
      chatId: chat.id,
      name: "Rae",
      phone: "612-555-0177",
      smsConsent: true,
    });

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: updated.leadId ?? "" } });
    expect(lead.handoffAt).not.toBeNull();
    expect(lead.handoffReason).not.toBe("");
  });
});

describe("public endpoint limits", () => {
  it("stops one IP opening endless conversations", async () => {
    const ip = "198.51.100.7";
    for (let i = 0; i < MAX_CHATS_PER_IP_PER_HOUR; i += 1) {
      expect(await checkStartLimit(ip)).toEqual({ ok: true });
      await startWebChat({ ip });
    }
    const verdict = await checkStartLimit(ip);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.retryAfter).toBeGreaterThan(0);
  });

  it("counts chats per IP, so one visitor cannot block another", async () => {
    for (let i = 0; i < MAX_CHATS_PER_IP_PER_HOUR; i += 1) {
      await startWebChat({ ip: "198.51.100.7" });
    }
    expect(await checkStartLimit("198.51.100.8")).toEqual({ ok: true });
  });

  it("caps the turns in a single conversation", async () => {
    await makeBotConfig({ webChatMaxTurns: 2 });
    const { chat } = await startWebChat({ ip: "198.51.100.9" });

    expect(await checkMessageLimit(chat.id, "198.51.100.9", 2)).toEqual({ ok: true });
    await replyToVisitor(chat.id, "One");
    await replyToVisitor(chat.id, "Two");

    const verdict = await checkMessageLimit(chat.id, "198.51.100.9", 2);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toContain("details");
  });

  it("rejects a chat id that does not exist", async () => {
    const verdict = await checkMessageLimit("nope", "198.51.100.9", 30);
    expect(verdict.ok).toBe(false);
  });
});

describe("CORS allowlist", () => {
  it("allows a configured origin", () => {
    vi.stubEnv("WEB_CHAT_ORIGINS", "https://atheneummartialarts.com");
    const headers = corsHeaders(
      new Request("https://portal.example/api/chat", {
        headers: { origin: "https://atheneummartialarts.com" },
      }),
    );
    expect(headers?.["Access-Control-Allow-Origin"]).toBe("https://atheneummartialarts.com");
    vi.unstubAllEnvs();
  });

  it("refuses a site that is not the studio's", () => {
    vi.stubEnv("WEB_CHAT_ORIGINS", "https://atheneummartialarts.com");
    const headers = corsHeaders(
      new Request("https://portal.example/api/chat", {
        headers: { origin: "https://scraper.example" },
      }),
    );
    expect(headers).toBeNull();
    vi.unstubAllEnvs();
  });

  it("treats a same-origin request (the embed page) as fine", () => {
    expect(corsHeaders(new Request("https://portal.example/api/chat"))).toEqual({});
  });
});

describe("daily model budget", () => {
  it("counts only replies a model was actually paid for", async () => {
    const { chat } = await startWebChat({});
    await prisma.webChatMessage.createMany({
      data: [
        { chatId: chat.id, role: "BOT", body: "ai", generatedBy: "AI" },
        { chatId: chat.id, role: "BOT", body: "rules", generatedBy: "RULES" },
        { chatId: chat.id, role: "VISITOR", body: "hello", generatedBy: "RULES" },
      ],
    });
    expect(await aiRepliesToday()).toBe(1);
  });
});
