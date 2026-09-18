import Link from "next/link";
import { redirect } from "next/navigation";
import { isKioskEnabled } from "@/lib/kiosk";
import { exitKioskMode } from "@/lib/kiosk-actions";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function KioskExitPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  if (!(await isKioskEnabled())) redirect("/kiosk");

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <Link href="/kiosk" className="text-lg text-stone-500 active:text-stone-800">
        &larr; Back to check-in
      </Link>

      <section>
        <h1 className="text-3xl font-bold tracking-tight">Exit kiosk mode</h1>
        <p className="mt-2 text-lg text-stone-600">
          For staff only — sign in with your coach or admin credentials to turn off kiosk mode on
          this device.
        </p>
      </section>

      <form
        action={exitKioskMode}
        className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label htmlFor="exit-email" className="mb-1 block text-lg font-medium">
            Staff email
          </label>
          <input
            id="exit-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            className="w-full rounded-xl border border-stone-300 px-4 py-3.5 text-lg"
          />
        </div>
        <div>
          <label htmlFor="exit-password" className="mb-1 block text-lg font-medium">
            Password
          </label>
          <input
            id="exit-password"
            name="password"
            type="password"
            required
            autoComplete="off"
            className="w-full rounded-xl border border-stone-300 px-4 py-3.5 text-lg"
          />
        </div>
        {searchParams.error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
            {searchParams.error}
          </p>
        )}
        <SubmitButton
          pendingLabel="Exiting…"
          className="w-full rounded-xl bg-stone-800 px-6 py-4 text-xl font-semibold text-white hover:bg-stone-900"
        >
          Exit kiosk mode
        </SubmitButton>
      </form>
    </div>
  );
}
