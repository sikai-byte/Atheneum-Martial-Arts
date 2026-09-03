import type { Lead } from "@prisma/client";
import { prisma } from "../db";
import { verifyAgainstFacts, upcomingClasses } from "./agent";
import { getBotConfig, isQuietHour, type BotSettings } from "./config";
import { knowledgeForLead, renderKnowledge } from "./knowledge";
import { IN_FLIGHT_STATUSES } from "./messageStatus";

/** A staff member typing by hand may say things the agent may not; automation may not. */
export type OutboundActor = "AUTOMATION" | "STAFF";

export type OutboundCandidate = {
  leadId: string;
  body: string;
  actor: OutboundActor;
  /** Set for agent-authored text, including a draft a coach edited before approving. */
  agentAuthored: boolean;
  proposedSessionId?: string | null;
  /** The row being delivered, so it doesn't count as a duplicate of itself. */
  excludeMessageId?: string;
  now?: Date;
};

/**
 * `defer` separates "not yet" from "not ever": a quiet-hours hold should send itself when the
 * window opens, while an opt-out must never send at all. Collapsing the two would either text
 * people at 6am or silently drop the night's follow-ups.
 */
export type OutboundVerdict = { ok: true } | { ok: false; reason: string; defer?: boolean };

/** Two identical texts inside this window is a bug or a double-click, never an intention. */
const DUPLICATE_WINDOW_MS = 10 * 60_000;

/**
 * The last thing every outbound message passes, whoever wrote it. The agent already refuses to
 * invent a price or a class time, but before this existed a coach could edit those same claims
 * into an approved draft and the check never ran again — the model was the only thing being
 * policed, when the thing that reaches the customer is what matters.
 */
export async function validateOutbound(candidate: OutboundCandidate): Promise<OutboundVerdict> {
  const now = candidate.now ?? new Date();
  const body = candidate.body.trim();
  if (!body) return { ok: false, reason: "The message is empty." };

  const lead = await prisma.lead.findUnique({ where: { id: candidate.leadId } });
  if (!lead) return { ok: false, reason: "That lead no longer exists." };
  if (lead.optedOutAt) return { ok: false, reason: "This lead opted out of texts." };

  const config = await getBotConfig();
  // Quiet hours protect the customer from automation, not from a coach deciding to reply now.
  if (candidate.actor === "AUTOMATION" && isQuietHour(now, config)) {
    return {
      ok: false,
      reason: "Held for quiet hours — it will send when they lift.",
      defer: true,
    };
  }

  const duplicate = await prisma.leadMessage.findFirst({
    where: {
      leadId: lead.id,
      direction: "OUTBOUND",
      body,
      status: { in: ["SENT", ...IN_FLIGHT_STATUSES] },
      createdAt: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) },
      ...(candidate.excludeMessageId ? { id: { not: candidate.excludeMessageId } } : {}),
    },
  });
  if (duplicate) return { ok: false, reason: "That exact text just went out to this lead." };

  if (candidate.proposedSessionId) {
    const session = await prisma.classSession.findUnique({
      where: { id: candidate.proposedSessionId },
    });
    if (!session || session.status !== "SCHEDULED" || session.startsAt < now) {
      return { ok: false, reason: "The class this message books is no longer on the schedule." };
    }
  }

  if (candidate.agentAuthored) {
    const grounding = await groundingFor(lead, config);
    const verdict = verifyAgainstFacts(body, grounding);
    if (!verdict.ok) return { ok: false, reason: `The message ${verdict.violation}.` };
  }

  return { ok: true };
}

/** The same corpus the agent was allowed to draw on, so approval is judged against generation. */
async function groundingFor(lead: Lead, config: BotSettings): Promise<string> {
  const facts = renderKnowledge(await knowledgeForLead(lead));
  const classes = await upcomingClasses(lead.interest ?? "", lead.ageGroup, config.timezone);
  return [facts, classes.map((c) => c.label).join("\n")].join("\n");
}
