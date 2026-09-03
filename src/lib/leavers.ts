import path from "path";
import fs from "fs/promises";
import { prisma } from "./db";
import { uploadsDir } from "./uploads";

export const RETENTION_YEARS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function purgeDueAt(deactivatedAt: Date): Date {
  const due = new Date(deactivatedAt);
  due.setFullYear(due.getFullYear() + RETENTION_YEARS);
  return due;
}

/**
 * Permanently deletes every record tied to a member profile (and its linked
 * user account, if any): bookings, attendance, milestones, waiver, PIN,
 * photos, posts, comments, orders, telemetry, and the household when it is
 * left empty. Audit-log entries are kept as the record that the account
 * existed and was deleted.
 */
export async function purgeProfileData(profileId: string): Promise<string | null> {
  const profile = await prisma.memberProfile.findUnique({
    where: { id: profileId },
    include: { user: true },
  });
  if (!profile) return null;

  const posts = profile.user
    ? await prisma.post.findMany({
        where: { authorId: profile.user.id, photoType: { not: "" } },
        select: { id: true },
      })
    : [];

  await prisma.$transaction(async (tx) => {
    await tx.booking.deleteMany({ where: { profileId } });
    await tx.attendance.deleteMany({ where: { profileId } });
    await tx.milestone.deleteMany({ where: { profileId } });
    await tx.waiverSignature.deleteMany({ where: { profileId } });
    await tx.telemetryEvent.deleteMany({ where: { profileId } });

    if (profile.user) {
      const userId = profile.user.id;
      await tx.comment.deleteMany({ where: { authorId: userId } });
      await tx.post.deleteMany({ where: { authorId: userId } });
      await tx.order.deleteMany({ where: { userId } });
      await tx.telemetryEvent.deleteMany({ where: { userId } });
      await tx.memberProfile.delete({ where: { id: profileId } });
      await tx.user.delete({ where: { id: userId } });
    } else {
      await tx.memberProfile.delete({ where: { id: profileId } });
    }

    const remaining = await tx.household.findUnique({
      where: { id: profile.householdId },
      include: { users: true, profiles: true },
    });
    if (remaining && remaining.users.length === 0 && remaining.profiles.length === 0) {
      await tx.household.delete({ where: { id: profile.householdId } });
    }
  });

  await fs.unlink(path.join(uploadsDir(), profileId)).catch(() => {});
  for (const post of posts) {
    await fs.unlink(path.join(uploadsDir(), `post-${post.id}`)).catch(() => {});
  }
  return profile.name;
}

/**
 * Permanently deletes leavers whose hold has expired: no activity is possible
 * while deactivated, so a hold older than the retention period means
 * RETENTION_YEARS of inactivity.
 */
export async function purgeExpiredLeavers(): Promise<number> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);

  const expired = await prisma.memberProfile.findMany({
    where: { deactivatedAt: { not: null, lt: cutoff } },
    select: { id: true, name: true, deactivatedAt: true },
  });

  for (const profile of expired) {
    const name = await purgeProfileData(profile.id);
    if (name) {
      await prisma.auditLog.create({
        data: {
          actorId: "system",
          actorName: "Retention policy",
          actorRole: "SYSTEM",
          action: "ACCOUNT_PURGED",
          targetType: "MemberProfile",
          targetId: profile.id,
          summary: `Permanently deleted ${name}'s data — leaver hold expired after ${RETENTION_YEARS} years`,
        },
      });
    }
  }
  return expired.length;
}

export function startRetentionSchedule(): void {
  const globalState = globalThis as unknown as {
    retentionTimer?: ReturnType<typeof setInterval>;
  };
  if (globalState.retentionTimer) return;

  const tick = async () => {
    try {
      const purged = await purgeExpiredLeavers();
      if (purged > 0) console.log(`[retention] Purged ${purged} expired leaver(s)`);
    } catch (err) {
      console.error("[retention] Purge failed:", err);
    }
  };
  void tick();
  globalState.retentionTimer = setInterval(tick, DAY_MS);
}
