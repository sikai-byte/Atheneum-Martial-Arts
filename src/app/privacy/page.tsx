import Link from "next/link";
import {
  BUSINESS_ADDRESS,
  BUSINESS_EMAIL,
  BUSINESS_NAME,
  BUSINESS_PHONE,
  LEGAL_UPDATED,
} from "@/lib/legal";

export const metadata = { title: "Privacy Policy — Atheneum Martial Arts" };

export default function PrivacyPage() {
  return (
    <article className="prose-legal mx-auto max-w-2xl space-y-5 py-4 text-stone-700">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">Privacy Policy</h1>
        <p className="mt-1 text-sm text-stone-500">Last updated: {LEGAL_UPDATED}</p>
      </header>

      <p>
        This policy explains what information {BUSINESS_NAME} (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;) collects through the member portal, how we use it, and the choices you
        have. We collect only what we need to run the gym.
      </p>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">What we collect</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Account details</strong> — your name, email address, password (stored only as
            a secure hash), and an optional profile photo.
          </li>
          <li>
            <strong>Household and child profiles</strong> — children&rsquo;s names, birth dates
            (used to show age-appropriate classes), optional photos, and check-in PINs (stored
            only as a secure hash). Child profiles are created and managed by a parent or
            guardian.
          </li>
          <li>
            <strong>Membership and training records</strong> — your membership type and renewal
            date, class bookings, attendance and check-in history, private-session logs, and
            leaderboard standings.
          </li>
          <li>
            <strong>Waivers</strong> — the liability waiver you sign at registration, including
            your typed signature and the date.
          </li>
          <li>
            <strong>Content you post</strong> — community posts, comments, reactions, photos, and
            videos, plus feedback you send us.
          </li>
          <li>
            <strong>Shop orders</strong> — the items, sizes, and quantities you order. We do not
            collect or store card numbers.
          </li>
          <li>
            <strong>Technical data</strong> — sign-in events, basic usage events (such as
            bookings made through the app), and push-notification subscriptions if you turn on
            class reminders. We do not use advertising trackers or analytics services.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">How we use it</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Running class bookings, check-ins, waitlists, and attendance tracking.</li>
          <li>Managing memberships, renewals, and punch passes.</li>
          <li>Sending service emails (welcome, booking confirmations, password resets, class reminders).</li>
          <li>Optional push notifications you turn on yourself.</li>
          <li>Showing community posts and leaderboards to other members of the gym.</li>
          <li>Keeping the portal secure and diagnosing problems.</li>
        </ul>
        <p className="mt-2">
          We never sell your information or share it with advertisers.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Children&rsquo;s information</h2>
        <p className="mt-2">
          Child profiles exist only under a parent or guardian&rsquo;s account. The parent
          provides the child&rsquo;s information, signs the waiver on their behalf, and can view
          and manage everything stored about the child. Children do not have their own logins or
          email addresses. To review or remove a child&rsquo;s information, use your parent
          account or contact us.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Who we share it with</h2>
        <p className="mt-2">
          Your information is visible to gym staff (coaches and admins) as needed to run classes.
          Community posts and leaderboard entries are visible to other members. We use a small
          number of service providers to operate the portal:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Railway (application and database hosting)</li>
          <li>Resend (delivering our service emails)</li>
          <li>Cloudflare R2 (encrypted off-site backups)</li>
        </ul>
        <p className="mt-2">
          These providers process data only on our behalf. We do not share data with anyone else
          unless required by law.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">How long we keep it</h2>
        <p className="mt-2">
          While you are a member, we keep your training history so your long-term progress is
          preserved. If your account is deactivated, your data is retained for up to 7 years (for
          waiver and record-keeping purposes) and then permanently deleted. Nightly backups are
          encrypted (AES-256).
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Your choices and rights</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>View and correct your details anytime from <Link href="/account" className="text-brand underline">My account</Link>.</li>
          <li>Turn push notifications on or off from My account &rarr; Notifications.</li>
          <li>
            Request a copy or deletion of your data from My account &rarr; Privacy &amp; data, or
            by contacting us. Deletion requests are honored promptly, except records we must keep
            (such as signed waivers) for legal purposes.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Contact</h2>
        <p className="mt-2">
          {BUSINESS_NAME}
          <br />
          {BUSINESS_ADDRESS}
          <br />
          {BUSINESS_PHONE} · {BUSINESS_EMAIL}
        </p>
      </section>

      <p className="text-sm text-stone-500">
        See also our <Link href="/terms" className="text-brand underline">Terms of Service</Link>{" "}
        and <Link href="/cookies" className="text-brand underline">Cookie Policy</Link>.
      </p>
    </article>
  );
}
