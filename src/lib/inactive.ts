import { PrismaClient } from "@prisma/client";
import { prisma } from "./db";

export const INACTIVE_AFTER_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Archives members whose membership ended INACTIVE_AFTER_DAYS or more ago:
 * sets inactiveAt so they drop out of rosters, pickers, kiosk, and
 * leaderboards. Nothing is deleted, sign-in still works, and an admin can
 * reactivate at any time.
 */
export async function archiveLapsedMembers(db: PrismaClient = prisma): Promise<number> {
  const cutoff = new Date(Date.now() - INACTIVE_AFTER_DAYS * DAY_MS);

  const lapsed = await db.memberProfile.findMany({
    where: {
      inactiveAt: null,
      deactivatedAt: null,
      membershipRenewsAt: { lt: cutoff },
    },
    select: { id: true, name: true, membershipRenewsAt: true },
  });

  const now = new Date();
  for (const profile of lapsed) {
    await db.memberProfile.update({
      where: { id: profile.id },
      data: { inactiveAt: now },
    });
    await db.booking.updateMany({
      where: {
        profileId: profile.id,
        status: { in: ["BOOKED", "WAITLISTED"] },
        session: { startsAt: { gt: now } },
      },
      data: { status: "CANCELLED" },
    });
    await db.auditLog.create({
      data: {
        actorId: "system",
        actorName: "Membership policy",
        actorRole: "SYSTEM",
        action: "MEMBER_ARCHIVED",
        targetType: "MemberProfile",
        targetId: profile.id,
        summary: `Moved ${profile.name} to inactive — membership ended ${INACTIVE_AFTER_DAYS}+ days ago`,
      },
    });
  }
  return lapsed.length;
}

export function startInactiveSchedule(): void {
  const globalState = globalThis as unknown as {
    inactiveTimer?: ReturnType<typeof setInterval>;
  };
  if (globalState.inactiveTimer) return;

  const tick = async () => {
    try {
      const archived = await archiveLapsedMembers();
      if (archived > 0) console.log(`[inactive] Archived ${archived} lapsed member(s)`);
    } catch (err) {
      console.error("[inactive] Archive sweep failed:", err);
    }
  };
  void tick();
  globalState.inactiveTimer = setInterval(tick, DAY_MS);
}
