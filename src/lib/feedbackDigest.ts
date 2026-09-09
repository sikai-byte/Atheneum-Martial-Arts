import type { PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { appUrl, sendEmail } from "./email";

const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * HOUR_MS;
const MARKER = "FEEDBACK_WEEKLY_SUMMARY";

/** Weekly summaries run through this date (12 weeks from the 2026-09-09 launch). */
const DIGEST_ENDS = new Date("2026-12-02T23:59:59.000Z");

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function digestHtml(
  items: { name: string; email: string; message: string; createdAt: Date; resolved: boolean }[],
  openTotal: number
): string {
  const rows =
    items.length === 0
      ? `<p>No new feedback this week.</p>`
      : items
          .map(
            (f) => `<div style="margin:0 0 16px">
              <p style="margin:0 0 4px"><strong>${escapeHtml(f.name)}</strong> (${escapeHtml(f.email)}) ·
                ${f.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ·
                ${f.resolved ? "resolved" : "open"}</p>
              <blockquote style="border-left:3px solid #0039b7;margin:0;padding:8px 12px;background:#f5f5f4">${escapeHtml(f.message)}</blockquote>
            </div>`
          )
          .join("");
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">
    <h2 style="color:#0039b7">Atheneum Martial Arts</h2>
    <p><strong>${items.length}</strong> new feedback item${items.length === 1 ? "" : "s"} this week · <strong>${openTotal}</strong> still open overall.</p>
    ${rows}
    <p><a href="${appUrl()}/admin/feedback">Open the feedback inbox</a></p>
  </div>`;
}

/** Emails admins a summary of the past week's member feedback, at most once per week. */
export async function runFeedbackDigestPass(db: PrismaClient = prisma): Promise<boolean> {
  const now = new Date();
  if (now > DIGEST_ENDS) return false;

  const lastSent = await db.telemetryEvent.findFirst({
    where: { type: "AUTOMATED_EMAIL", metadata: MARKER },
    orderBy: { createdAt: "desc" },
  });
  if (lastSent && now.getTime() - lastSent.createdAt.getTime() < WEEK_MS - HOUR_MS) {
    return false;
  }

  const since = new Date(now.getTime() - WEEK_MS);
  const recent = await db.feedback.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, email: true } } },
  });
  const openTotal = await db.feedback.count({ where: { resolvedAt: null } });
  const admins = await db.user.findMany({
    where: { role: "ADMIN", deactivatedAt: null },
    select: { email: true },
  });
  if (admins.length === 0) return false;

  const items = recent.map((f) => ({
    name: f.user.name,
    email: f.user.email,
    message: f.message,
    createdAt: f.createdAt,
    resolved: f.resolvedAt !== null,
  }));
  for (const admin of admins) {
    await sendEmail(
      admin.email,
      `Weekly feedback summary: ${items.length} new, ${openTotal} open`,
      digestHtml(items, openTotal)
    );
  }
  await db.telemetryEvent.create({ data: { type: "AUTOMATED_EMAIL", metadata: MARKER } });
  return true;
}

export function startFeedbackDigestSchedule(): void {
  const globalState = globalThis as unknown as {
    feedbackDigestTimer?: ReturnType<typeof setInterval>;
  };
  if (globalState.feedbackDigestTimer) return;

  const tick = async () => {
    try {
      const sent = await runFeedbackDigestPass();
      if (sent) console.log("[feedback-digest] Weekly feedback summary sent");
    } catch (err) {
      console.error("[feedback-digest] Digest pass failed:", err);
    }
  };
  void tick();
  globalState.feedbackDigestTimer = setInterval(tick, HOUR_MS);
}
