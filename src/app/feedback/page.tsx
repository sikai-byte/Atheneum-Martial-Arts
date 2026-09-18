import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { submitFeedback } from "@/lib/actions";
import { formatDay } from "@/lib/format";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string };
}) {
  const user = await requireUser();
  const previous = await prisma.feedback.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Send feedback</h1>
        <p className="mt-1 text-stone-600">
          Found a bug, something confusing, or an idea to make the portal better? It goes straight
          to the team.
        </p>
      </section>

      {searchParams.success && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
          {searchParams.success}
        </p>
      )}
      {searchParams.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {searchParams.error}
        </p>
      )}

      <form action={submitFeedback} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <label htmlFor="feedback-message" className="mb-1 block text-sm font-medium">
          What&apos;s on your mind?
        </label>
        <textarea
          id="feedback-message"
          name="message"
          required
          maxLength={2000}
          rows={5}
          placeholder="e.g. Booking a class took one tap too many, or I'd love to see..."
          className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
        />
        <SubmitButton
          pendingLabel="Sending…"
          className="mt-3 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Send feedback
        </SubmitButton>
      </form>

      {previous.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Your recent feedback
          </h2>
          <div className="mt-2 space-y-3">
            {previous.map((f) => (
              <div key={f.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <p className="whitespace-pre-wrap text-sm text-stone-700">{f.message}</p>
                <p className="mt-2 text-xs text-stone-400">
                  {formatDay(f.createdAt)}
                  {f.resolvedAt && (
                    <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 font-semibold text-green-800">
                      Resolved
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
