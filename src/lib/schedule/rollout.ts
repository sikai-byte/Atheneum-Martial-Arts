import { prisma } from "../db";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Rolls the weekly timetable forward. The studio runs the same grid every week, so each session in
 * the last seven days is copied into the coming weeks unless it is already there. Without this the
 * seeded fortnight runs out and the sales agent stops having real class times to offer.
 */
export async function ensureUpcomingSessions(weeksAhead = 4, now = new Date()) {
  const template = await prisma.classSession.findMany({
    where: { startsAt: { gte: new Date(now.getTime() - WEEK_MS), lt: now }, status: "SCHEDULED" },
    select: { templateId: true, startsAt: true, instructor: true },
  });

  const horizon = new Date(now.getTime() + weeksAhead * WEEK_MS);
  const existing = await prisma.classSession.findMany({
    where: { startsAt: { gte: now, lte: horizon } },
    select: { templateId: true, startsAt: true },
  });
  const taken = new Set(existing.map((s) => `${s.templateId}@${s.startsAt.getTime()}`));

  const created: { templateId: string; startsAt: Date; instructor: string }[] = [];
  for (const session of template) {
    for (let week = 1; week <= weeksAhead; week += 1) {
      const startsAt = new Date(session.startsAt.getTime() + week * WEEK_MS);
      if (startsAt <= now || startsAt > horizon) continue;
      const key = `${session.templateId}@${startsAt.getTime()}`;
      if (taken.has(key)) continue;
      taken.add(key);
      created.push({ templateId: session.templateId, startsAt, instructor: session.instructor });
    }
  }

  if (created.length > 0) await prisma.classSession.createMany({ data: created });
  return created.length;
}
