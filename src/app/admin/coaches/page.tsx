import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { coachInitials } from "@/lib/format";
import PhotoCropUploader from "@/components/PhotoCropUploader";
import Flash from "@/components/Flash";
import SubmitButton from "@/components/SubmitButton";
import UnifiedSaveForm from "@/components/UnifiedSaveForm";
import {
  createCoach,
  deleteCoach,
  removeCoachPhoto,
  saveAllCoaches,
  updateCoachPhoto,
} from "@/lib/adminContent";

export const dynamic = "force-dynamic";

const inputClass = "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm";

function CoachFields({
  coach,
  idPrefix,
  namePrefix = "",
  formId,
}: {
  coach?: { name: string; role: string; disciplines: string; bio: string; sortOrder: number };
  idPrefix: string;
  namePrefix?: string;
  formId?: string;
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
            name={`${namePrefix}name`}
            form={formId}
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
              name={`${namePrefix}role`}
              form={formId}
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
              name={`${namePrefix}sortOrder`}
              form={formId}
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
          name={`${namePrefix}disciplines`}
          form={formId}
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
          name={`${namePrefix}bio`}
          form={formId}
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
  searchParams: { error?: string; ok?: string };
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
        <Flash ok={searchParams.ok} error={searchParams.error} />
      </section>

      <UnifiedSaveForm formId="coaches-save" action={saveAllCoaches}>
      <section className="space-y-4" aria-label="Coaches">
        {coaches.map((coach) => (
          <article key={coach.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-4">
              {coach.photoType ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/coach-photo/${coach.id}?v=${coach.photoUpdatedAt?.getTime() ?? 0}`}
                  alt={coach.name}
                  className="h-24 w-24 shrink-0 rounded-full object-cover ring-2 ring-stone-100"
                />
              ) : (
                <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-brand/10 text-2xl font-bold text-brand">
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
                <div className="mt-2 flex flex-wrap items-start gap-3">
                  <PhotoCropUploader
                    action={updateCoachPhoto.bind(null, coach.id)}
                    buttonLabel={coach.photoType ? "Change photo" : "Upload photo"}
                  />
                  {coach.photoType && (
                    <form action={removeCoachPhoto.bind(null, coach.id)}>
                      <SubmitButton
                        pendingLabel="Removing…"
                        className="rounded-md border border-stone-300 px-2.5 py-1.5 text-xs text-stone-600 hover:bg-stone-100"
                      >
                        Remove photo
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <input type="hidden" name="coachId" value={coach.id} form="coaches-save" />
              <CoachFields
                coach={coach}
                idPrefix={`coach-${coach.id}`}
                namePrefix={`c_${coach.id}_`}
                formId="coaches-save"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={`c_${coach.id}_active`}
                  form="coaches-save"
                  defaultChecked={coach.active}
                  className="h-4 w-4 rounded border-stone-300"
                />
                Show on the Coaches page
              </label>
            </div>
            <form action={deleteCoach.bind(null, coach.id)} className="mt-3 text-right">
              <SubmitButton pendingLabel="Deleting…" className="text-xs text-red-600 hover:underline">
                Delete this coach
              </SubmitButton>
            </form>
          </article>
        ))}
      </section>
      </UnifiedSaveForm>

      <section aria-labelledby="add-coach">
        <h2 id="add-coach" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Add a coach
        </h2>
        <form
          action={createCoach}
          className="mt-2 space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
        >
          <CoachFields idPrefix="new-coach" />
          <SubmitButton
            pendingLabel="Adding…"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Add coach
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
