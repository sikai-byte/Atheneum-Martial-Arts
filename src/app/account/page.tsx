import { requireUser } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/actions";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: { updated?: string };
}) {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <section>
        <h1 className="page-title">My account</h1>
        <p className="mt-1 text-slate-600">
          {user.name} — {user.email}
        </p>
      </section>

      <section className="card p-5">
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
              className="field-input py-2.5"
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
              className="field-input py-2.5"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Update password
          </button>
        </form>
      </section>
    </div>
  );
}
