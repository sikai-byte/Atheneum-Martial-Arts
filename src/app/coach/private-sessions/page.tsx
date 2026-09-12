/* eslint-disable @next/next/no-img-element */
import { prisma } from "@/lib/db";
import { requireCoach } from "@/lib/auth";
import { deletePrivateSession, logPrivateSession } from "@/lib/actions";
import { formatDay, formatTime } from "@/lib/format";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export default async function PrivateSessionsPage() {
  await requireCoach();

  const [members, sessions] = await Promise.all([
    prisma.memberProfile.findMany({
      where: { deactivatedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, isChild: true },
    }),
    prisma.privateSession.findMany({
      include: { profile: { select: { name: true } } },
      orderBy: { heldAt: "desc" },
      take: 30,
    }),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Private sessions</h1>
        <p className="mt-1 text-stone-600">
          Log competition training and other private sessions that aren&apos;t on the class
          schedule. Members see their sessions and notes on their Progress page.
        </p>
      </section>

      <section aria-labelledby="log-session">
        <h2 id="log-session" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Log a session
        </h2>
        <form
          action={logPrivateSession}
          className="mt-2 space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap gap-3">
            <div className="min-w-52 flex-1">
              <label htmlFor="ps-member" className="mb-1 block text-sm font-medium">
                Member
              </label>
              <select
                id="ps-member"
                name="profileId"
                required
                className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
              >
                <option value="">Pick a member…</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.isChild ? " (youth)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ps-heldat" className="mb-1 block text-sm font-medium">
                Date &amp; time
              </label>
              <input
                id="ps-heldat"
                name="heldAt"
                type="datetime-local"
                required
                defaultValue={toLocalInputValue(new Date())}
                className="rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="ps-notes" className="mb-1 block text-sm font-medium">
              Training notes
            </label>
            <textarea
              id="ps-notes"
              name="notes"
              rows={3}
              maxLength={2000}
              placeholder="What was worked on? Anything to remember for next time?"
              className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="ps-photo" className="mb-1 block text-sm font-medium">
              Photo <span className="font-normal text-stone-500">(optional)</span>
            </label>
            <input
              id="ps-photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-stone-700"
            />
          </div>
          <SubmitButton
            pendingLabel="Logging…"
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Log session
          </SubmitButton>
        </form>
      </section>

      <section aria-labelledby="recent-sessions">
        <h2 id="recent-sessions" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Recent sessions
        </h2>
        {sessions.length === 0 ? (
          <p className="mt-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm text-stone-600">
            No private sessions logged yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{s.profile.name}</p>
                    <p className="mt-1 text-sm text-stone-600">
                      {formatDay(s.heldAt)} at {formatTime(s.heldAt)} · logged by {s.recordedBy}
                    </p>
                    {s.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{s.notes}</p>}
                    {s.photoType && (
                      <img
                        src={`/api/private-session-photo/${s.id}`}
                        alt={`${s.profile.name} private session`}
                        className="mt-3 max-h-64 rounded-lg border border-stone-200 object-cover"
                      />
                    )}
                  </div>
                  <form action={deletePrivateSession.bind(null, s.id)}>
                    <SubmitButton
                      pendingLabel="Removing…"
                      className="rounded-md border border-stone-300 px-2.5 py-1.5 text-xs text-stone-600 hover:bg-stone-100"
                    >
                      Remove
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
