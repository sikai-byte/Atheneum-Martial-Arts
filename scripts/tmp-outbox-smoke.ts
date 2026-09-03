import "dotenv/config";

// Bogus Twilio credentials make every real send fail, which is the whole point: this script asserts
// what the app does when the provider rejects a message. Set before importing anything that reads
// the environment.
process.env.GHL_API_TOKEN = "";
process.env.GHL_LOCATION_ID = "";
process.env.TWILIO_ACCOUNT_SID = "ACsmoke0000000000000000000000000000";
process.env.TWILIO_AUTH_TOKEN = "smoke-not-a-real-token";
process.env.TWILIO_MESSAGING_SERVICE_SID = "MGsmoke0000000000000000000000000000";

import { prisma } from "../src/lib/db";
import { getBotConfig, isQuietHour, nextSendableTime } from "../src/lib/leads/config";
import { approveAgentDraft, LeadInputError } from "../src/lib/leads/engine";
import { MAX_SEND_ATTEMPTS } from "../src/lib/leads/messageStatus";
import {
  deliverOutbound,
  queueOutbound,
  retryOutbound,
  retryStuckOutbound,
  sendOutbound,
} from "../src/lib/leads/outbox";

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`FAIL ${label}: expected ${e}, got ${a}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok   ${label} = ${a}`);
}

/** A moment inside the studio's quiet hours, whatever they're set to. */
function quietMoment(config: { timezone: string; quietHoursStart: number; quietHoursEnd: number }) {
  const candidate = new Date();
  for (let i = 0; i < 48; i += 1) {
    if (isQuietHour(candidate, config)) return candidate;
    candidate.setUTCHours(candidate.getUTCHours() + 1);
  }
  throw new Error("No quiet hour exists in this configuration");
}

async function newLead(phone: string) {
  return prisma.lead.create({
    data: { fullName: "Outbox Smoke", phone, source: "MANUAL", interest: "BJJ" },
  });
}

async function main() {
  const leadIds: string[] = [];
  const config = await getBotConfig();
  // Automated sends are held during quiet hours by design, so anything asserting delivery has to
  // run at a sendable moment rather than at whatever hour this script happens to be run.
  const sendable = nextSendableTime(new Date(), config);

  // 1. A provider rejection must leave the message on the thread, not lose it.
  const a = await newLead("+15550100001");
  leadIds.push(a.id);
  const failed = await sendOutbound({
    leadId: a.id,
    body: "Provider will reject this.",
    actor: "STAFF",
    sentBy: "Coach Smoke",
  });
  check("provider rejection reports FAILED", failed.status, "FAILED");
  const failedRow = await prisma.leadMessage.findUniqueOrThrow({ where: { id: failed.message.id } });
  check("failed message still exists", failedRow.status, "FAILED");
  check("failed message keeps its body", failedRow.body, "Provider will reject this.");
  check("failed message records the error", Boolean(failedRow.errorText), true);
  check("failed message counted one attempt", failedRow.attempts, 1);
  check("failed message has no sentAt", failedRow.sentAt, null);
  const lead1 = await prisma.lead.findUniqueOrThrow({ where: { id: a.id } });
  check("failed send does not claim first contact", lead1.firstContactedAt, null);

  // 2. An approved draft that the provider rejects survives, with the coach's edit intact — this is
  //    the bug that motivated the slice: the row used to be deleted before the provider was called.
  const b = await newLead("+15550100002");
  leadIds.push(b.id);
  const draft = await prisma.leadMessage.create({
    data: {
      leadId: b.id,
      direction: "OUTBOUND",
      body: "Want to come try a class this week?",
      status: "DRAFT",
      actor: "AUTOMATION",
      automated: true,
      agentAuthored: true,
    },
  });
  let approveError = "";
  try {
    await approveAgentDraft(draft.id, "Coach Smoke", "Want to come try a class Saturday?");
  } catch (error) {
    approveError = error instanceof LeadInputError ? "LeadInputError" : "other";
  }
  check("rejected approval surfaces an error", approveError, "LeadInputError");
  const draftRow = await prisma.leadMessage.findUnique({ where: { id: draft.id } });
  check("approved draft was not deleted", Boolean(draftRow), true);
  check("approved draft keeps the coach's edit", draftRow?.body, "Want to come try a class Saturday?");
  check("approved draft is retryable", draftRow?.status, "FAILED");
  check("approved draft records the editor", draftRow?.sentBy, "Coach Smoke");
  check("approved draft marked staff-edited", draftRow?.staffEdited, true);

  // 3. A coach editing an invented price into an agent draft is held, not sent.
  const c = await newLead("+15550100003");
  leadIds.push(c.id);
  const priceDraft = await prisma.leadMessage.create({
    data: {
      leadId: c.id,
      direction: "OUTBOUND",
      body: "A coach will confirm the details with you.",
      status: "DRAFT",
      actor: "AUTOMATION",
      automated: true,
      agentAuthored: true,
    },
  });
  let priceError = "";
  try {
    await approveAgentDraft(priceDraft.id, "Coach Smoke", "Kids classes are $97/month, all in.");
  } catch (error) {
    priceError = error instanceof LeadInputError ? "LeadInputError" : "other";
  }
  check("invented price is rejected", priceError, "LeadInputError");
  const priceRow = await prisma.leadMessage.findUnique({ where: { id: priceDraft.id } });
  check("invented price is held, not failed", priceRow?.status, "BLOCKED");
  check("held message never reached the provider", priceRow?.provider, "MOCK");

  // 4. Opting out beats everything, including a staff retry of a held message.
  const d = await newLead("+15550100004");
  leadIds.push(d.id);
  await prisma.lead.update({ where: { id: d.id }, data: { optedOutAt: new Date() } });
  const blocked = await sendOutbound({ leadId: d.id, body: "Still interested?", actor: "STAFF" });
  check("opted-out lead is not texted", blocked.status, "BLOCKED");
  const retried = await retryOutbound(blocked.message.id, "Coach Smoke");
  check("retry re-checks the opt-out", retried.status, "BLOCKED");

  // 5. The same text twice in a row is a double-click, not an intention.
  const e = await newLead("+15550100005");
  leadIds.push(e.id);
  const firstQueued = await queueOutbound({ leadId: e.id, body: "Same text", actor: "STAFF" });
  await prisma.leadMessage.update({
    where: { id: firstQueued.id },
    data: { status: "SENT", sentAt: new Date() },
  });
  const duplicate = await sendOutbound({ leadId: e.id, body: "Same text", actor: "STAFF" });
  check("duplicate text is held", duplicate.status, "BLOCKED");

  // 6. Two ticks racing the same row must reach the provider once.
  const f = await newLead("+15550100006");
  leadIds.push(f.id);
  const raced = await queueOutbound({ leadId: f.id, body: "Race me", actor: "AUTOMATION" });
  const [one, two] = await Promise.all([
    deliverOutbound(raced.id, sendable),
    deliverOutbound(raced.id, sendable),
  ]);
  const claimedElsewhere = [one.status, two.status].filter((s) => s === "CLAIMED_ELSEWHERE").length;
  check("only one delivery claims the row", claimedElsewhere, 1);
  const racedRow = await prisma.leadMessage.findUniqueOrThrow({ where: { id: raced.id } });
  check("raced row attempted once", racedRow.attempts, 1);

  // 7. A row stranded in SENDING by a crashed process is recoverable, but attempts stay bounded.
  const g = await newLead("+15550100007");
  leadIds.push(g.id);
  const stranded = await queueOutbound({ leadId: g.id, body: "Stranded", actor: "AUTOMATION" });
  await prisma.leadMessage.update({
    where: { id: stranded.id },
    data: {
      status: "SENDING",
      lastAttemptAt: new Date(Date.now() - 10 * 60_000),
      attempts: MAX_SEND_ATTEMPTS,
    },
  });
  const recovered = await deliverOutbound(stranded.id, sendable);
  check("stale SENDING row is recovered", recovered.status, "FAILED");
  check(
    "exhausted attempts stop automatic retries",
    recovered.status === "FAILED" ? recovered.retryable : null,
    false,
  );

  // 8. Quiet hours defer rather than discard: the text stays queued and a later tick delivers it.
  const h = await newLead("+15550100008");
  leadIds.push(h.id);
  const quiet = quietMoment(config);
  const held = await sendOutbound({ leadId: h.id, body: "Quiet hours", actor: "AUTOMATION" }, quiet);
  check("quiet hours defer an automated text", held.status, "DEFERRED");
  const heldRow = await prisma.leadMessage.findUniqueOrThrow({ where: { id: held.message.id } });
  check("deferred text stays queued", heldRow.status, "PENDING");
  check("deferred text spends no attempt", heldRow.attempts, 0);
  await prisma.leadMessage.update({
    where: { id: heldRow.id },
    data: { createdAt: new Date(sendable.getTime() - 10 * 60_000) },
  });
  const swept = await retryStuckOutbound(sendable);
  check("a later tick picks the deferred text up", swept.considered >= 1, true);
  const sweptRow = await prisma.leadMessage.findUniqueOrThrow({ where: { id: heldRow.id } });
  check("deferred text was attempted once quiet hours lifted", sweptRow.status, "FAILED");

  // A coach replying by hand is not automation, so quiet hours must not stop them.
  const i = await newLead("+15550100009");
  leadIds.push(i.id);
  const byHand = await sendOutbound(
    { leadId: i.id, body: "Coach replying late", actor: "STAFF", sentBy: "Coach Smoke" },
    quiet,
  );
  check("quiet hours do not hold a coach's own reply", byHand.status, "FAILED");

  // 9. A message that books a class has to describe the class it books, or the lead comes on the
  // wrong day — the schedule check alone is satisfied by any real class, including a different one.
  const j = await newLead("+15550100010");
  leadIds.push(j.id);
  const session = await prisma.classSession.findFirstOrThrow({
    where: { status: "SCHEDULED", startsAt: { gt: sendable } },
    orderBy: { startsAt: "asc" },
  });
  const slot = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: config.timezone,
  }).format(session.startsAt);
  const wrongDay = slot.toLowerCase().startsWith("monday") ? "Friday" : "Monday";
  const mismatched = await sendOutbound(
    {
      leadId: j.id,
      body: `See you ${wrongDay} then!`,
      actor: "AUTOMATION",
      agentAuthored: true,
      proposedSessionId: session.id,
    },
    sendable,
  );
  check("a booking that names another day is blocked", mismatched.status, "BLOCKED");
  const truthful = await sendOutbound(
    {
      leadId: j.id,
      body: `See you ${slot.split(" ")[0]} then!`,
      actor: "AUTOMATION",
      agentAuthored: true,
      proposedSessionId: session.id,
    },
    sendable,
  );
  check("a booking that names its own day is allowed through", truthful.status, "FAILED");

  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
