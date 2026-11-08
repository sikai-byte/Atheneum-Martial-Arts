import { createMemberAccount } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";

/** New login + household. Staff roles are only offered to admins. */
export default function CreateAccountForm({ allowStaffRoles = false }: { allowStaffRoles?: boolean }) {
  return (
    <form
      action={createMemberAccount}
      className="mt-2 space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
    >
      <p className="text-sm text-stone-600">
        Creates a login and a new household. Leave the password blank and the member picks
        their own from the onboarding email you send once their membership is set up.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="new-name" className="mb-1 block text-sm font-medium">
            Full name
          </label>
          <input
            id="new-name"
            name="name"
            required
            maxLength={80}
            placeholder="e.g. Sam Johnson"
            className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="new-email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="new-email"
            name="email"
            type="email"
            required
            placeholder="e.g. sam@example.com"
            className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="new-password" className="mb-1 block text-sm font-medium">
            Temporary password (optional)
          </label>
          <input
            id="new-password"
            name="password"
            type="text"
            minLength={8}
            placeholder="Blank = member sets their own"
            className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="new-role" className="mb-1 block text-sm font-medium">
            Role
          </label>
          <select
            id="new-role"
            name="role"
            className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
          >
            <option value="MEMBER">Member (trains themselves)</option>
            <option value="PARENT">Parent (manages kids)</option>
            {allowStaffRoles && (
              <>
                <option value="COACH">Coach</option>
                <option value="ADMIN">Admin (member management)</option>
              </>
            )}
          </select>
        </div>
      </div>
      <fieldset className="rounded-lg border border-stone-200 bg-stone-50 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Trial account
        </legend>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="trial" className="h-4 w-4 rounded border-stone-300" />
            This is a trial (member or parent only)
          </label>
          <div>
            <label htmlFor="trial-ends" className="mb-1 block text-xs font-medium">
              Trial ends (default: 1 week from today)
            </label>
            <input
              id="trial-ends"
              name="trialEndsAt"
              type="date"
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="trial-class-type" className="mb-1 block text-xs font-medium">
              Trial classes allowed
            </label>
            <select
              id="trial-class-type"
              name="trialClassType"
              defaultValue="BOTH"
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="BOTH">Group and private</option>
              <option value="GROUP">Group classes only</option>
              <option value="PRIVATE">Private trial only</option>
            </select>
          </div>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Trial members can browse everything and book classes until their trial ends. After
          creating the account you land on their page to book their first class (group or
          private) and copy the sign-in text for your lead bot.
        </p>
      </fieldset>
      <SubmitButton
        pendingLabel="Creating…"
        className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        Create account
      </SubmitButton>
    </form>
  );
}
