import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/actions";
import { setOwnPin, signOwnWaiver } from "@/lib/kiosk-actions";
import { WAIVER_PARAGRAPHS, WAIVER_TITLE } from "@/lib/waiver";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: {
    updated?: string;
    pinError?: string;
    pinSaved?: string;
    waiverError?: string;
    waiverSigned?: string;
  };
}) {
  const user = await requireUser();
  const profiles = user.householdId
    ? await prisma.memberProfile.findMany({
        where: { householdId: user.householdId },
        include: { waiver: true },
        orderBy: [{ isChild: "asc" }, { name: "asc" }],
      })
    : [];

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">My account</h1>
        <p className="mt-1 text-stone-600">
          {user.name} — {user.email}
        </p>
      </section>

      {profiles.length > 0 && (
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Front-desk check-in PIN</h2>
          <p className="mt-1 text-sm text-stone-600">
            The 4-digit PIN used to check in on the gym iPad. Each person in your household has
            their own.
          </p>
          {searchParams.pinSaved && (
            <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
              PIN saved for {searchParams.pinSaved}.
            </p>
          )}
          {searchParams.pinError && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {searchParams.pinError}
            </p>
          )}
          <div className="mt-4 space-y-4">
            {profiles.map((p) => (
              <form
                key={p.id}
                action={setOwnPin.bind(null, p.id)}
                className="flex flex-wrap items-end gap-3 border-t border-stone-100 pt-4 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {p.name}
                    {p.isChild && <span className="ml-1 text-xs text-stone-500">(child)</span>}
                  </p>
                  <p className="text-xs text-stone-500">
                    {p.pinHash ? "PIN is set — enter a new one to change it." : "No PIN yet."}
                  </p>
                </div>
                <div>
                  <label htmlFor={`pin-${p.id}`} className="mb-1 block text-xs font-medium">
                    4-digit PIN
                  </label>
                  <input
                    id={`pin-${p.id}`}
                    name="pin"
                    type="password"
                    inputMode="numeric"
                    pattern="\d{4}"
                    minLength={4}
                    maxLength={4}
                    required
                    autoComplete="off"
                    className="w-24 rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                </div>
                <SubmitButton
                  pendingLabel="Saving…"
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
                >
                  {p.pinHash ? "Change PIN" : "Set PIN"}
                </SubmitButton>
              </form>
            ))}
          </div>
        </section>
      )}

      {profiles.some((p) => !p.waiver) && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
          <h2 className="text-lg font-semibold">Liability waiver</h2>
          <p className="mt-1 text-sm text-stone-600">
            Everyone who trains needs a signed waiver on file. Please review and sign below.
          </p>
          {searchParams.waiverSigned && (
            <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
              Waiver signed for {searchParams.waiverSigned}. Thank you!
            </p>
          )}
          {searchParams.waiverError && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {searchParams.waiverError}
            </p>
          )}
          <details className="mt-3 rounded-lg border border-stone-200 bg-white p-3 text-sm">
            <summary className="cursor-pointer font-medium">{WAIVER_TITLE}</summary>
            <div className="mt-2 space-y-2 text-stone-600">
              {WAIVER_PARAGRAPHS.map((para) => (
                <p key={para.slice(0, 40)}>{para}</p>
              ))}
            </div>
          </details>
          <div className="mt-4 space-y-4">
            {profiles
              .filter((p) => !p.waiver)
              .map((p) => (
                <form
                  key={p.id}
                  action={signOwnWaiver.bind(null, p.id)}
                  className="space-y-3 border-t border-stone-200 pt-4 first:border-t-0 first:pt-0"
                >
                  <p className="text-sm font-medium">
                    {p.name}
                    {p.isChild && <span className="ml-1 text-xs text-stone-500">(child)</span>}
                  </p>
                  <div>
                    <label htmlFor={`waiver-name-${p.id}`} className="mb-1 block text-xs font-medium">
                      Type your full name to sign
                      {p.isChild ? " (as parent/guardian)" : ""}
                    </label>
                    <input
                      id={`waiver-name-${p.id}`}
                      name="signedName"
                      required
                      maxLength={80}
                      className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm sm:max-w-sm"
                    />
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="agree"
                      required
                      className="mt-0.5 h-4 w-4 rounded border-stone-300"
                    />
                    I have read and agree to the waiver above
                    {p.isChild ? ` on behalf of ${p.name}` : ""}.
                  </label>
                  <SubmitButton
                    pendingLabel="Signing…"
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
                  >
                    Sign waiver
                  </SubmitButton>
                </form>
              ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Change password</h2>
        {searchParams.updated === "1" && (
          <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            Your password has been updated.
          </p>
        )}
        <form action={changeOwnPassword} className="mt-4 space-y-4">
          <div>
            <label htmlFor="current-password" className="mb-1 block text-sm font-medium">
              Current password
            </label>
            <input
              id="current-password"
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="new-password" className="mb-1 block text-sm font-medium">
              New password (at least 8 characters)
            </label>
            <input
              id="new-password"
              name="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
            />
          </div>
          <SubmitButton
            pendingLabel="Updating…"
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Update password
          </SubmitButton>
        </form>
      </section>
    </div>
  );
}
