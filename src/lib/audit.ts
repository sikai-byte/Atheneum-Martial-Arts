import { prisma } from "./db";

type Actor = { id: string; name: string; role: string };

/** Records a staff (admin/coach) action in the audit trail. Best-effort: never throws. */
export async function recordAudit(
  actor: Actor,
  action: string,
  opts: { targetType?: string; targetId?: string; summary?: string } = {}
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        action,
        targetType: opts.targetType ?? "",
        targetId: opts.targetId ?? "",
        summary: opts.summary ?? "",
      },
    });
  } catch (err) {
    console.error("[audit] failed to record entry:", err);
  }
}
