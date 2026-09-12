import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { resolveFeedback } from "@/lib/actions";
import { formatDay } from "@/lib/format";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  await requireAdmin();
  const items = await prisma.feedback.findMany({
    include: { user: { select: { name: true, email: true, role: true } } },
    orderBy: { createdAt: "desc" },
  });
  const open = items.filter((f) => !f.resolvedAt);
  const resolved = items.filter((f) => f.resolvedAt);

  const renderItem = (f: (typeof items)[number]) => (
    <div key={f.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {f.user.name}
            <span className="ml-2 text-xs font-normal text-stone-500">
              {f.user.email} · {f.user.role.toLowerCase()}
            </span>
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{f.message}</p>
          <p className="mt-2 text-xs text-stone-400">{formatDay(f.createdAt)}</p>
        </div>
        <form action={resolveFeedback.bind(null, f.id)}>
          <input type="hidden" name="resolved" value={f.resolvedAt ? "" : "1"} />
          <SubmitButton
            pendingLabel="Saving…"
            className={
              f.resolvedAt
                ? "rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
                : "rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
            }
          >
            {f.resolvedAt ? "Reopen" : "Mark resolved"}
          </SubmitButton>
        </form>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Member feedback</h1>
        <p className="mt-1 text-stone-600">
          Everything members, parents, and coaches have sent through the in-app feedback form.
        </p>
      </section>

      <section aria-labelledby="open-feedback">
        <h2 id="open-feedback" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Open ({open.length})
        </h2>
        <div className="mt-2 space-y-3">
          {open.length === 0 && (
            <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600 shadow-sm">
              No open feedback — inbox zero.
            </p>
          )}
          {open.map(renderItem)}
        </div>
      </section>

      {resolved.length > 0 && (
        <section aria-labelledby="resolved-feedback">
          <h2
            id="resolved-feedback"
            className="text-sm font-semibold uppercase tracking-wide text-stone-500"
          >
            Resolved ({resolved.length})
          </h2>
          <div className="mt-2 space-y-3">{resolved.map(renderItem)}</div>
        </section>
      )}
    </div>
  );
}
