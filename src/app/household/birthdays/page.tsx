import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { saveChildBirthdays } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function HouseholdBirthdaysPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const children = (user.household?.profiles ?? []).filter(
    (p) => p.isChild && !p.deactivatedAt
  );
  if (children.length === 0) redirect("/");
  const missing = children.filter((c) => !c.birthDate);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">One quick step before you start</h1>
        <p className="mt-1 text-stone-600">
          Please add each child&apos;s date of birth so we can place them in the right classes.
          We&apos;ll calculate their age automatically from here on.
        </p>
      </section>

      {searchParams.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          One of the dates didn&apos;t look right — please double-check and try again.
        </p>
      )}

      <form
        action={saveChildBirthdays}
        className="space-y-4 rounded-xl border border-stone-200 bg-white p-5"
      >
        {children.map((child) => (
          <div
            key={child.id}
            className="border-t border-stone-100 pt-4 first:border-t-0 first:pt-0"
          >
            <label htmlFor={`birthdate-${child.id}`} className="mb-1 block text-sm font-medium">
              {child.name} — date of birth
            </label>
            <input
              id={`birthdate-${child.id}`}
              name={`birthdate-${child.id}`}
              type="date"
              required={!child.birthDate}
              defaultValue={child.birthDate ? child.birthDate.toISOString().slice(0, 10) : ""}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm sm:max-w-xs"
            />
          </div>
        ))}
        <SubmitButton
          pendingLabel="Saving…"
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Save birthdays &amp; continue
        </SubmitButton>
        {missing.length === 0 && (
          <p className="text-xs text-stone-500">
            All birthdays are on file — you can update them here any time.
          </p>
        )}
      </form>
    </div>
  );
}
