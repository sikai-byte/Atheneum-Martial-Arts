import type { PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { appUrl, sendEmail } from "./email";
import { formatDay, formatTime } from "./format";

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_START_MS = 12 * HOUR_MS;
const WINDOW_END_MS = 28 * HOUR_MS;

function reminderHtml(firstName: string, className: string, startsAt: Date, forChild?: string) {
  const who = forChild ? `<strong>${forChild}</strong> is` : "you're";
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
    <h2 style="color:#0039b7">Atheneum Martial Arts</h2>
    <p>Hi ${firstName}, a quick reminder that ${who} booked for a trial class:
      <strong>${className}</strong> on <strong>${formatDay(startsAt)}</strong> at
      <strong>${formatTime(startsAt)}</strong>. We can't wait to see ${forChild ? "them" : "you"} on the mats!</p>
    <p style="margin:24px 0">
      <a href="${appUrl()}/schedule" style="background:#0039b7;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">View the schedule</a>
    </p>
    <p style="color:#666;font-size:14px">Can't make it? Cancel from the portal so someone on the waitlist can take the spot.</p>
  </div>`;
}

/**
 * Sends a one-time reminder email for every trial member's booked class
 * starting roughly a day from now. Adults are emailed directly; for child
 * profiles the household's parent accounts are emailed instead.
 */
export async function runReminderPass(db: PrismaClient = prisma): Promise<number> {
  const now = Date.now();
  const bookings = await db.booking.findMany({
    where: {
      status: "BOOKED",
      reminderSentAt: null,
      session: {
        status: "SCHEDULED",
        startsAt: { gte: new Date(now + WINDOW_START_MS), lte: new Date(now + WINDOW_END_MS) },
      },
      profile: { deactivatedAt: null, membershipType: "TRIAL" },
    },
    include: {
      session: { include: { template: true } },
      profile: {
        include: {
          user: true,
          household: { include: { users: true } },
        },
      },
    },
  });

  let sent = 0;
  for (const booking of bookings) {
    const { profile, session } = booking;
    const className = session.template.name;

    const recipients: { email: string; firstName: string; forChild?: string }[] = [];
    if (profile.user && !profile.user.deactivatedAt) {
      recipients.push({
        email: profile.user.email,
        firstName: profile.user.name.split(" ")[0],
      });
    } else if (profile.isChild) {
      for (const parent of profile.household.users) {
        if (parent.role === "PARENT" && !parent.deactivatedAt) {
          recipients.push({
            email: parent.email,
            firstName: parent.name.split(" ")[0],
            forChild: profile.name,
          });
        }
      }
    }
    if (recipients.length === 0) continue;

    try {
      for (const r of recipients) {
        await sendEmail(
          r.email,
          `Reminder: ${className} ${formatDay(session.startsAt)} at ${formatTime(session.startsAt)}`,
          reminderHtml(r.firstName, className, session.startsAt, r.forChild)
        );
      }
      await db.booking.update({
        where: { id: booking.id },
        data: { reminderSentAt: new Date() },
      });
      sent += 1;
    } catch (err) {
      console.error(`[reminders] Failed to send reminder for booking ${booking.id}:`, err);
    }
  }
  return sent;
}

export function startReminderSchedule(): void {
  const globalState = globalThis as unknown as { reminderTimer?: ReturnType<typeof setInterval> };
  if (globalState.reminderTimer) return;

  const tick = async () => {
    try {
      const sent = await runReminderPass();
      if (sent > 0) console.log(`[reminders] Sent ${sent} trial class reminder(s)`);
    } catch (err) {
      console.error("[reminders] Reminder pass failed:", err);
    }
  };
  void tick();
  globalState.reminderTimer = setInterval(tick, HOUR_MS);
}
