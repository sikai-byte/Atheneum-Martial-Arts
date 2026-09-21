import type { PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { appUrl, sendEmail } from "./email";

const HOUR_MS = 60 * 60 * 1000;
const TIME_ZONE = "America/Chicago";
const SEND_HOUR = 10; // 10:00 AM Central
const MARKER_PREFIX = "LOGIN_NUDGE:";

/** Dates (Central) on which members who have never signed in get a reminder. */
export const NUDGE_DATES = ["2026-09-19", "2026-09-20", "2026-09-23", "2026-09-27"];

export function chicagoDate(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
  };
}

function nudgeHtml(firstName: string, nth: number): string {
  const opener =
    nth === 0
      ? `Your Atheneum member portal account is ready, and we noticed you haven't signed in yet.`
      : `Just a friendly nudge — your Atheneum member portal account is still waiting for you.`;
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
    <h2 style="color:#0039b7">Atheneum Martial Arts</h2>
    <p>Hi ${firstName}, ${opener}</p>
    <p>In the portal you can book classes, see the schedule, track your punch card, and keep up with the community.</p>
    <p style="margin:24px 0">
      <a href="${appUrl()}/login" style="background:#0039b7;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Sign in to the portal</a>
    </p>
    <p style="color:#666;font-size:14px">Sign in with this email address. Don't know your password? Use
      <a href="${appUrl()}/forgot-password">Forgot password</a> and we'll send you a reset link.</p>
    <p style="color:#666;font-size:14px">Add the portal to your phone's home screen for one-tap access. Questions? Just reply to this email or ask at the front desk.</p>
  </div>`;
}

/**
 * On each scheduled date (after 10 AM Central), emails every active member or
 * parent account that has never signed in. Each account is emailed at most
 * once per scheduled date.
 */
export async function runLoginNudgePass(
  db: PrismaClient = prisma,
  now: Date = new Date()
): Promise<number> {
  const { date, hour } = chicagoDate(now);
  const nth = NUDGE_DATES.indexOf(date);
  if (nth === -1 || hour < SEND_HOUR) return 0;
  const marker = `${MARKER_PREFIX}${date}`;

  const [loggedIn, alreadyNudged] = await Promise.all([
    db.telemetryEvent.findMany({
      where: { type: "LOGIN", userId: { not: null } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    db.telemetryEvent.findMany({
      where: { type: "AUTOMATED_EMAIL", metadata: marker, userId: { not: null } },
      select: { userId: true },
    }),
  ]);
  const skip = new Set<string>();
  for (const e of [...loggedIn, ...alreadyNudged]) if (e.userId) skip.add(e.userId);

  const candidates = await db.user.findMany({
    where: {
      role: { in: ["MEMBER", "PARENT"] },
      deactivatedAt: null,
      id: { notIn: Array.from(skip) },
      OR: [{ profile: null }, { profile: { inactiveAt: null } }],
    },
    select: { id: true, email: true, name: true },
  });

  let sent = 0;
  for (const user of candidates) {
    try {
      await sendEmail(
        user.email,
        nth === 0
          ? "Your Atheneum member portal is ready"
          : "Reminder: sign in to your Atheneum member portal",
        nudgeHtml(user.name.split(" ")[0], nth)
      );
      await db.telemetryEvent.create({
        data: { type: "AUTOMATED_EMAIL", metadata: marker, userId: user.id },
      });
      sent += 1;
    } catch (err) {
      console.error(`[login-nudges] Failed to email ${user.id}:`, err);
    }
  }
  return sent;
}

export function startLoginNudgeSchedule(): void {
  const globalState = globalThis as unknown as {
    loginNudgeTimer?: ReturnType<typeof setInterval>;
  };
  if (globalState.loginNudgeTimer) return;

  const tick = async () => {
    try {
      const sent = await runLoginNudgePass();
      if (sent > 0) console.log(`[login-nudges] Sent ${sent} sign-in reminder(s)`);
    } catch (err) {
      console.error("[login-nudges] Pass failed:", err);
    }
  };
  void tick();
  globalState.loginNudgeTimer = setInterval(tick, HOUR_MS);
}
