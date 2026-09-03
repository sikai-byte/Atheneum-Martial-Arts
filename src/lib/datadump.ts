import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Provider-agnostic full-database dump/restore, used by the nightly backup job
 * and the scripts/export-data.ts / scripts/import-data.ts CLI tools.
 * Tables are listed in foreign-key dependency order so a restore can insert top-down.
 * Prisma DateTime inputs accept ISO strings, so a JSON round-trip restores cleanly.
 */

export const DUMP_VERSION = 1;

export interface DataDump {
  version: number;
  exportedAt: string;
  tables: {
    household: Prisma.HouseholdCreateManyInput[];
    user: Prisma.UserCreateManyInput[];
    passwordResetToken: Prisma.PasswordResetTokenCreateManyInput[];
    memberProfile: Prisma.MemberProfileCreateManyInput[];
    coachProfile: Prisma.CoachProfileCreateManyInput[];
    program: Prisma.ProgramCreateManyInput[];
    classTemplate: Prisma.ClassTemplateCreateManyInput[];
    recurringSlot: Prisma.RecurringSlotCreateManyInput[];
    classSession: Prisma.ClassSessionCreateManyInput[];
    booking: Prisma.BookingCreateManyInput[];
    attendance: Prisma.AttendanceCreateManyInput[];
    milestone: Prisma.MilestoneCreateManyInput[];
    product: Prisma.ProductCreateManyInput[];
    order: Prisma.OrderCreateManyInput[];
    post: Prisma.PostCreateManyInput[];
    comment: Prisma.CommentCreateManyInput[];
    announcement: Prisma.AnnouncementCreateManyInput[];
    telemetryEvent: Prisma.TelemetryEventCreateManyInput[];
    auditLog: Prisma.AuditLogCreateManyInput[];
  };
}

export async function exportAll(prisma: PrismaClient): Promise<DataDump> {
  const [
    household,
    user,
    passwordResetToken,
    memberProfile,
    coachProfile,
    program,
    classTemplate,
    recurringSlot,
    classSession,
    booking,
    attendance,
    milestone,
    product,
    order,
    post,
    comment,
    announcement,
    telemetryEvent,
    auditLog,
  ] = await Promise.all([
    prisma.household.findMany(),
    prisma.user.findMany(),
    prisma.passwordResetToken.findMany(),
    prisma.memberProfile.findMany(),
    prisma.coachProfile.findMany(),
    prisma.program.findMany(),
    prisma.classTemplate.findMany(),
    prisma.recurringSlot.findMany(),
    prisma.classSession.findMany(),
    prisma.booking.findMany(),
    prisma.attendance.findMany(),
    prisma.milestone.findMany(),
    prisma.product.findMany(),
    prisma.order.findMany(),
    prisma.post.findMany(),
    prisma.comment.findMany(),
    prisma.announcement.findMany(),
    prisma.telemetryEvent.findMany(),
    prisma.auditLog.findMany(),
  ]);

  return {
    version: DUMP_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      household,
      user,
      passwordResetToken,
      memberProfile,
      coachProfile,
      program,
      classTemplate,
      recurringSlot,
      classSession,
      booking,
      attendance,
      milestone,
      product,
      order,
      post,
      comment,
      announcement,
      telemetryEvent,
      auditLog,
    },
  };
}

/** Deletes everything in reverse FK order, then inserts the dump top-down. IDs are preserved. */
export async function importAll(prisma: PrismaClient, dump: DataDump): Promise<void> {
  if (dump.version !== DUMP_VERSION) {
    throw new Error(`Unsupported dump version ${dump.version} (expected ${DUMP_VERSION}).`);
  }
  const t = dump.tables;

  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.telemetryEvent.deleteMany(),
    prisma.announcement.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.post.deleteMany(),
    prisma.order.deleteMany(),
    prisma.product.deleteMany(),
    prisma.milestone.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.classSession.deleteMany(),
    prisma.recurringSlot.deleteMany(),
    prisma.classTemplate.deleteMany(),
    prisma.program.deleteMany(),
    prisma.coachProfile.deleteMany(),
    prisma.memberProfile.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.user.deleteMany(),
    prisma.household.deleteMany(),

    prisma.household.createMany({ data: t.household }),
    prisma.user.createMany({ data: t.user }),
    prisma.passwordResetToken.createMany({ data: t.passwordResetToken }),
    prisma.memberProfile.createMany({ data: t.memberProfile }),
    prisma.coachProfile.createMany({ data: t.coachProfile }),
    prisma.program.createMany({ data: t.program }),
    prisma.classTemplate.createMany({ data: t.classTemplate }),
    prisma.recurringSlot.createMany({ data: t.recurringSlot }),
    prisma.classSession.createMany({ data: t.classSession }),
    prisma.booking.createMany({ data: t.booking }),
    prisma.attendance.createMany({ data: t.attendance }),
    prisma.milestone.createMany({ data: t.milestone }),
    prisma.product.createMany({ data: t.product }),
    prisma.order.createMany({ data: t.order }),
    prisma.post.createMany({ data: t.post }),
    prisma.comment.createMany({ data: t.comment }),
    prisma.announcement.createMany({ data: t.announcement }),
    prisma.telemetryEvent.createMany({ data: t.telemetryEvent }),
    prisma.auditLog.createMany({ data: t.auditLog }),
  ]);
}
