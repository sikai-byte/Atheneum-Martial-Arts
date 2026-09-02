import { prisma } from "./db";

const WEEKS_AHEAD = 3;
const RUN_INTERVAL_MS = 10 * 60 * 1000;

let lastRunAt = 0;

function slotDate(dayOfWeek: number, hour: number, minute: number, weekOffset: number) {
  const now = new Date();
  const d = new Date(now);
  const diff = (dayOfWeek - now.getDay() + 7) % 7;
  d.setDate(now.getDate() + diff + weekOffset * 7);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * Materializes ClassSession rows for the next few weeks from the active
 * RecurringSlot rows. Safe to call on every schedule view — it early-returns
 * unless the throttle window has passed and skips sessions that already exist.
 */
export async function ensureUpcomingSessions() {
  const now = Date.now();
  if (now - lastRunAt < RUN_INTERVAL_MS) return;
  lastRunAt = now;

  const slots = await prisma.recurringSlot.findMany({ where: { active: true } });
  if (slots.length === 0) return;

  const targets: { templateId: string; startsAt: Date; instructor: string }[] = [];
  for (const slot of slots) {
    for (let week = 0; week <= WEEKS_AHEAD; week++) {
      const startsAt = slotDate(slot.dayOfWeek, slot.hour, slot.minute, week);
      if (startsAt > new Date()) {
        targets.push({ templateId: slot.templateId, startsAt, instructor: slot.instructor });
      }
    }
  }
  if (targets.length === 0) return;

  const horizon = new Date();
  horizon.setDate(horizon.getDate() + (WEEKS_AHEAD + 1) * 7);

  await prisma.$transaction(async (tx) => {
    // Take the write lock up front so concurrent generation serializes.
    await tx.$executeRaw`UPDATE RecurringSlot SET id = id WHERE id = ${slots[0].id}`;
    const existing = await tx.classSession.findMany({
      where: {
        templateId: { in: slots.map((s) => s.templateId) },
        startsAt: { gte: new Date(), lte: horizon },
      },
      select: { templateId: true, startsAt: true },
    });
    const seen = new Set(existing.map((s) => `${s.templateId}|${s.startsAt.getTime()}`));
    for (const t of targets) {
      if (seen.has(`${t.templateId}|${t.startsAt.getTime()}`)) continue;
      await tx.classSession.create({ data: t });
    }
  });
}
