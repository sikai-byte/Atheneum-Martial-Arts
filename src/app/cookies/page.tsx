import Link from "next/link";
import { BUSINESS_EMAIL, BUSINESS_NAME, BUSINESS_PHONE, LEGAL_UPDATED } from "@/lib/legal";

export const metadata = { title: "Cookie Policy — Atheneum Martial Arts" };

export default function CookiesPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-5 py-4 text-stone-700">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">Cookie Policy</h1>
        <p className="mt-1 text-sm text-stone-500">Last updated: {LEGAL_UPDATED}</p>
      </header>

      <p>
        The {BUSINESS_NAME} member portal uses only essential cookies — the minimum needed for
        the site to work. We do not use advertising, analytics, or tracking cookies, and no
        third parties set cookies through the portal. Because every cookie we set is strictly
        necessary, no cookie consent banner is required.
      </p>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Cookies we set</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Session cookie</strong> — keeps you signed in after you log in. Encrypted,
            HTTP-only, and cleared when you sign out.
          </li>
          <li>
            <strong>Kiosk cookie</strong> — marks the gym&rsquo;s front-desk device as a
            check-in kiosk. Only set on that device by staff.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Similar technologies</h2>
        <p className="mt-2">
          If you install the portal to your home screen, your browser caches app files so it
          loads fast and works offline (a standard feature of installable web apps). If you turn
          on class reminders, your browser stores a push subscription — you can turn this off
          anytime from My account &rarr; Notifications.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Managing cookies</h2>
        <p className="mt-2">
          You can clear or block cookies in your browser settings, but blocking the session
          cookie means you won&rsquo;t be able to stay signed in.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Questions</h2>
        <p className="mt-2">
          Contact us at {BUSINESS_EMAIL} or {BUSINESS_PHONE}. See also our{" "}
          <Link href="/privacy" className="text-brand underline">Privacy Policy</Link> and{" "}
          <Link href="/terms" className="text-brand underline">Terms of Service</Link>.
        </p>
      </section>
    </article>
  );
}
