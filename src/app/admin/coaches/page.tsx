import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { coachInitials } from "@/lib/format";
import {
  createCoach,
  deleteCoach,
  removeCoachPhoto,
  updateCoach,
  updateCoachPhoto,
} from "@/lib/adminContent";

export const dynamic = "force-dynamic";

const inputClass = "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm";

function CoachFields({
  coach,
  idPrefix,
}: {
  coach?: { name: string; role: string; disciplines: string; bio: string; sortOrder: number };
  idPrefix: string;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-name`} className="mb-1 block text-xs font-medium">
            Name
          </label>
          <input
            id={`${idPrefix}-name`}
            name="name"
            required
            maxLength={80}
            defaultValue={coach?.name ?? ""}
            placeholder="e.g. Coach Sam"
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${idPrefix}-role`} className="mb-1 block text-xs font-medium">
              Role
            </label>
            <select
              id={`${idPrefix}-role`}
              name="role"
              defaultValue={coach?.role ?? "MAIN"}
              className={inputClass}
            >
              <option value="MAIN">Main coach</option>
              <option value="ASSISTANT">Assistant coach</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${idPrefix}-sort`} className="mb-1 block text-xs font-medium">
              Display order
            </label>
            <input
              id={`${idPrefix}-sort`}
              name="sortOrder"
              type="number"
              min={0}
              max={999}
              defaultValue={coach?.sortOrder ?? 0}
              className={inputClass}
            />
          </div>
        </div>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-disciplines`} className="mb-1 block text-xs font-medium">
          Disciplines (comma-separated)
        </label>
        <input
          id={`${idPrefix}-disciplines`}
          name="disciplines"
          maxLength={200}
          defaultValue={coach?.disciplines ?? ""}
          placeholder="e.g. Muay Thai, No-Gi BJJ, Kids BJJ"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-bio`} className="mb-1 block text-xs font-medium">
          Short bio
        </label>
        <textarea
          id={`${idPrefix}-bio`}
          name="bio"
          rows={3}
          maxLength={1000}
          defaultValue={coach?.bio ?? ""}
          className={inputClass}
        />
      </div>
    </>
  );
}

export default async function AdminCoachesPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireAdmin();
  const coaches = await prisma.coachProfile.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-8">
      <section>
        <Link href="/admin" className="text-sm text-brand hover:underline">
          &larr; Back to Admin
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Edit Coaches</h1>
        <p className="mt-1 text-stone-600">
          Changes here update the Coaches page everyone sees. Hidden coaches stay saved but
          don&apos;t appear publicly.
        </p>
        {searchParams.error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {searchParams.error}
          </p>
        )}
      </section>

      <section className="space-y-4" aria-label="Coaches">
        {coaches.map((coach) => (
          <article key={coach.id} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex items-start gap-4">
              {coach.photoType ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/coach-photo/${coach.id}?v=${coach.photoUpdatedAt?.getTime() ?? 0}`}
                  alt={coach.name}
                  className="h-16 w-16 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand/10 text-lg font-bold text-brand">
                  {coachInitials(coach.name)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{coach.name}</h2>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">
                    {coach.role === "MAIN" ? "Main coach" : "Assistant coach"}
                  </span>
                  {!coach.active && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                      Hidden
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <form action={updateCoachPhoto.bind(null, coach.id)} className="flex items-center gap-2">
                    <input
                      type="file"
                      name="photo"
                      accept="image/jpeg,image/png,image/webp"
                      required
                      className="max-w-52 text-xs"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-stone-300 px-2.5 py-1.5 text-xs text-stone-600 hover:bg-stone-100"
                    >
                      Upload photo
                    </button>
                  </form>
                  {coach.photoType && (
                    <form action={removeCoachPhoto.bind(null, coach.id)}>
                      <button
                        type="submit"
                        className="rounded-md border border-stone-300 px-2.5 py-1.5 text-xs text-stone-600 hover:bg-stone-100"
                      >
                        Remove photo
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
            <form action={updateCoach.bind(null, coach.id)} className="mt-4 space-y-3">
              <CoachFields coach={coach} idPrefix={`coach-${coach.id}`} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={coach.active}
                    className="h-4 w-4 rounded border-stone-300"
                  />
                  Show on the Coaches page
                </label>
                <button
                  type="submit"
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
                >
                  Save changes
                </button>
              </div>
            </form>
            <form action={deleteCoach.bind(null, coach.id)} className="mt-3 text-right">
              <button
                type="submit"
                className="text-xs text-red-600 hover:underline"
              >
                Delete this coach
              </button>
            </form>
          </article>
        ))}
      </section>

      <section aria-labelledby="add-coach">
        <h2 id="add-coach" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Add a coach
        </h2>
        <form
          action={createCoach}
          className="mt-2 space-y-3 rounded-xl border border-stone-200 bg-white p-4"
        >
          <CoachFields idPrefix="new-coach" />
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Add coach
          </button>
        </form>
      </section>
    </div>
  );
}
