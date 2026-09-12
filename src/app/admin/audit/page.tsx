import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatDay, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

const ACTION_LABELS: Record<string, string> = {
  ACCOUNT_CREATED: "Account created",
  CHILD_ADDED: "Child added",
  MEMBERSHIP_UPDATED: "Membership updated",
  PASSWORD_RESET_BY_ADMIN: "Password reset",
  BOOKING_CREATED: "Booking created",
  BOOKING_CANCELLED: "Booking cancelled",
  PRIVATE_TRIAL_BOOKED: "Private trial booked",
  ATTENDANCE_TOGGLED: "Attendance",
  ORDER_STATUS_UPDATED: "Order updated",
  ANNOUNCEMENT_POSTED: "Announcement posted",
  ANNOUNCEMENT_DELETED: "Announcement deleted",
  POST_MODERATED: "Post moderated",
  COMMENT_MODERATED: "Comment moderated",
  COACH_CREATED: "Coach added",
  COACH_UPDATED: "Coach edited",
  COACH_DELETED: "Coach deleted",
  COACH_PHOTO_UPDATED: "Coach photo updated",
  COACH_PHOTO_REMOVED: "Coach photo removed",
  PRODUCT_CREATED: "Product added",
  PRODUCT_UPDATED: "Product edited",
  CLASS_UPDATED: "Class edited",
  SLOT_CREATED: "Slot added",
  SLOT_UPDATED: "Slot edited",
  SLOT_DELETED: "Slot removed",
  SESSION_CANCELLED: "Session cancelled",
  SESSION_RESTORED: "Session restored",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  await requireAdmin();

  const page = Math.max(Number(searchParams?.page ?? 1) || 1, 1);
  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count(),
  ]);
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div>
        <Link href="/admin" className="text-sm text-stone-500 hover:text-brand">
          &larr; Back to Admin
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-brand">Audit history</h1>
        <p className="mt-1 text-sm text-stone-500">
          Every admin and coach action, newest first. {total.toLocaleString()} total{" "}
          {total === 1 ? "entry" : "entries"}.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-500">
          No staff actions recorded yet — entries appear here as admins and coaches make changes.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Who</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-stone-100 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-stone-500">
                    {formatDay(entry.createdAt)} {formatTime(entry.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="font-medium text-stone-800">{entry.actorName}</span>{" "}
                    <span className="text-xs text-stone-400">{entry.actorRole}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-700">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </td>
                  <td className="px-4 py-3 text-stone-600">{entry.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={`/admin/audit?page=${page - 1}`} className="text-brand hover:underline">
              &larr; Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-stone-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={`/admin/audit?page=${page + 1}`} className="text-brand hover:underline">
              Older &rarr;
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
