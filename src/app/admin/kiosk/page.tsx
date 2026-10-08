import QRCode from "qrcode";
import { requireAdmin } from "@/lib/auth";
import { isKioskEnabled } from "@/lib/kiosk";
import { disableKioskMode, enableKioskMode } from "@/lib/kiosk-actions";
import { appUrl } from "@/lib/email";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function KioskAdminPage() {
  await requireAdmin();
  const enabled = await isKioskEnabled();
  const registerUrl = `${appUrl()}/register`;
  const qrDataUrl = await QRCode.toDataURL(registerUrl, { width: 480, margin: 1 });

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Front-desk kiosk</h1>
        <p className="mt-1 text-stone-600">
          Set up the front-desk iPad for self check-in, and print the QR poster for walk-in
          registration.
        </p>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Kiosk mode on this device</h2>
        <p className="mt-1 text-sm text-stone-600">
          Turning on kiosk mode lets anyone on this device check in to today&apos;s classes with
          their name and PIN, and register as a new member. Turn it on from the iPad itself, then
          add <span className="font-medium">/kiosk</span> to the home screen. Turning it on signs
          you out of your admin account on that device — kiosk mode stays on.
        </p>
        <p className="mt-2 text-sm text-stone-600">
          Status on this device:{" "}
          <span className={`font-semibold ${enabled ? "text-emerald-700" : "text-stone-700"}`}>
            {enabled ? "Kiosk mode is ON" : "Kiosk mode is off"}
          </span>
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {enabled ? (
            <form action={disableKioskMode}>
              <SubmitButton
                pendingLabel="Turning off…"
                className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100"
              >
                Turn off kiosk mode
              </SubmitButton>
            </form>
          ) : (
            <form action={enableKioskMode}>
              <SubmitButton
                pendingLabel="Turning on…"
                className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Turn on kiosk mode &amp; open kiosk
              </SubmitButton>
            </form>
          )}
          {enabled && (
            <a
              href="/kiosk"
              className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Open kiosk
            </a>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Walk-in registration QR poster</h2>
        <p className="mt-1 text-sm text-stone-600">
          Post this on the wall — friends and drop-ins scan it with their phone to register and
          sign the waiver at <span className="font-medium">{registerUrl}</span>.
        </p>
        <div className="mt-4 flex flex-col items-center rounded-xl border border-stone-200 p-6 text-center">
          <p className="text-xl font-bold">New here? Scan to join</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt={`QR code linking to ${registerUrl}`} className="mt-4 h-60 w-60 max-w-full" />
          <p className="mt-3 text-sm text-stone-500">{registerUrl}</p>
        </div>
        <p className="mt-3 text-sm text-stone-600">
          To print: open this page on a computer and use your browser&apos;s Print option, or
          long-press the QR image on the iPad to save it.
        </p>
      </section>
    </div>
  );
}
