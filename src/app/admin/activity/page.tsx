import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

function timeAgo(date: Date) {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function AdminActivityPage() {
  await requireAdmin();

  const [users, events, posts, comments] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["MEMBER", "PARENT", "COACH"] } },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { name: "asc" },
    }),
    prisma.telemetryEvent.findMany({
      where: { userId: { not: null } },
      select: { type: true, userId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.post.groupBy({ by: ["authorId"], _count: { _all: true } }),
    prisma.comment.groupBy({ by: ["authorId"], _count: { _all: true } }),
  ]);

  const postCounts = new Map(posts.map((p) => [p.authorId, p._count._all]));
  const commentCounts = new Map(comments.map((c) => [c.authorId, c._count._all]));

  const byUser = new Map<
    string,
    { lastSeen: Date | null; logins: number; bookings: number; cancellations: number }
  >();
  for (const u of users) {
    byUser.set(u.id, { lastSeen: null, logins: 0, bookings: 0, cancellations: 0 });
  }
  for (const e of events) {
    const entry = e.userId ? byUser.get(e.userId) : undefined;
    if (!entry) continue;
    if (e.type === "LOGIN") {
      if (!entry.lastSeen) entry.lastSeen = e.createdAt;
      entry.logins += 1;
    } else if (e.type === "SELF_BOOKING") {
      if (!entry.lastSeen) entry.lastSeen = e.createdAt;
      entry.bookings += 1;
    } else if (e.type === "SELF_CANCELLATION") {
      if (!entry.lastSeen) entry.lastSeen = e.createdAt;
      entry.cancellations += 1;
    }
  }

  const rows = users.map((u) => {
    const a = byUser.get(u.id)!;
    return {
      ...u,
      ...a,
      posts: postCounts.get(u.id) ?? 0,
      comments: commentCounts.get(u.id) ?? 0,
      active: a.lastSeen !== null,
    };
  });
  const activeRows = rows
    .filter((r) => r.active)
    .sort((a, b) => (b.lastSeen?.getTime() ?? 0) - (a.lastSeen?.getTime() ?? 0));
  const inactiveRows = rows.filter((r) => !r.active);

  const roleLabel: Record<string, string> = {
    MEMBER: "Member",
    PARENT: "Parent",
    COACH: "Coach",
  };

  return (
    <div className="space-y-8">
      <section>
        <Link href="/admin" className="text-sm text-brand hover:underline">
          &larr; Back to Admin
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Member activity</h1>
        <p className="mt-1 text-stone-600">
          Who has actually signed in and used the portal since their onboarding email.
        </p>
      </section>

      <section aria-labelledby="activity-stats">
        <h2 id="activity-stats" className="sr-only">
          Summary
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-brand">
              {activeRows.length} / {rows.length}
            </p>
            <p className="mt-1 text-xs text-stone-500">Accounts that have signed in</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-brand">
              {rows.reduce((n, r) => n + r.bookings, 0)}
            </p>
            <p className="mt-1 text-xs text-stone-500">Self-serve bookings made</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-brand">
              {rows.reduce((n, r) => n + r.posts + r.comments, 0)}
            </p>
            <p className="mt-1 text-xs text-stone-500">Community posts &amp; comments</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="active-users" className="space-y-3">
        <h2 id="active-users" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Signed in ({activeRows.length})
        </h2>
        {activeRows.length === 0 ? (
          <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-500">
            No one has signed in yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Person</th>
                  <th className="px-4 py-3">Last seen</th>
                  <th className="px-4 py-3 text-right">Logins</th>
                  <th className="px-4 py-3 text-right">Bookings</th>
                  <th className="px-4 py-3 text-right">Posts</th>
                  <th className="px-4 py-3 text-right">Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {activeRows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-stone-500">
                        {roleLabel[r.role] ?? r.role} · {r.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {r.lastSeen ? timeAgo(r.lastSeen) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">{r.logins}</td>
                    <td className="px-4 py-3 text-right">{r.bookings}</td>
                    <td className="px-4 py-3 text-right">{r.posts}</td>
                    <td className="px-4 py-3 text-right">{r.comments}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="inactive-users" className="space-y-3">
        <h2
          id="inactive-users"
          className="text-sm font-semibold uppercase tracking-wide text-stone-500"
        >
          Haven&apos;t signed in yet ({inactiveRows.length})
        </h2>
        {inactiveRows.length === 0 ? (
          <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-500">
            Everyone has signed in at least once.
          </p>
        ) : (
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <ul className="space-y-2 text-sm">
              {inactiveRows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="font-medium">{r.name}</span>{" "}
                    <span className="text-xs text-stone-500">
                      {roleLabel[r.role] ?? r.role} · {r.email}
                    </span>
                  </span>
                  <span className="text-xs text-stone-400">
                    account created{" "}
                    {r.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-stone-500">
              A friendly nudge helps — these folks got their onboarding email but haven&apos;t
              logged in yet.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
