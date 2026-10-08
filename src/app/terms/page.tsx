import Link from "next/link";
import {
  BUSINESS_ADDRESS,
  BUSINESS_EMAIL,
  BUSINESS_NAME,
  BUSINESS_PHONE,
  LEGAL_UPDATED,
} from "@/lib/legal";

export const metadata = { title: "Terms of Service — Atheneum Martial Arts" };

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-5 py-4 text-stone-700">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">Terms of Service</h1>
        <p className="mt-1 text-sm text-stone-500">Last updated: {LEGAL_UPDATED}</p>
      </header>

      <p>
        These terms govern your use of the {BUSINESS_NAME} member portal. By creating an account
        or using the portal, you agree to them.
      </p>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Your account</h2>
        <p className="mt-2">
          Accounts are for members, parents/guardians, and staff of the gym. Keep your password
          private and tell us right away if you think someone else has used your account. Parents
          are responsible for the profiles and bookings of children in their household.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Memberships and payments</h2>
        <p className="mt-2">
          Membership plans, punch passes, and trial periods are arranged directly with the gym;
          the portal displays your plan and renewal date but does not charge your card
          automatically. There are no hidden fees — what you agree with the gym is what you pay.
          If your membership lapses, the portal shows a renewal notice; contact Coach Sikai at
          612-558-3765 to re-up.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Refund policy</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Gear shop orders</strong> — unused merchandise in original condition may be
            returned or exchanged at the front desk within 30 days of pickup. Refunds are issued
            the way you paid.
          </li>
          <li>
            <strong>Memberships and punch passes</strong> — refunds are handled case by case;
            talk to the front desk or contact us at {BUSINESS_PHONE}.
          </li>
          <li>
            <strong>Class bookings</strong> — classes are included in your membership; you can
            cancel a booking anytime in the app before the class starts at no charge.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Training and waiver</h2>
        <p className="mt-2">
          Martial arts training involves physical contact and a risk of injury. Every
          participant (or their parent/guardian) must sign the liability waiver before training.
          The waiver you sign at registration or in the portal is part of your agreement with the
          gym.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Community rules</h2>
        <p className="mt-2">
          The community feed is for gym members. Only post photos and videos you have the right
          to share, and be respectful — no harassment, hate speech, or inappropriate content,
          especially involving minors. Staff may remove content or restrict posting at their
          discretion. You keep ownership of what you post but allow us to display it to other
          members within the portal.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Acceptable use</h2>
        <p className="mt-2">
          Don&rsquo;t misuse the portal: no attempting to access other people&rsquo;s accounts or
          data, no interfering with the service, and no automated scraping. We may suspend
          accounts that break these rules.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Disclaimers</h2>
        <p className="mt-2">
          The portal is provided &ldquo;as is&rdquo;. We work hard to keep it accurate and
          available but can&rsquo;t guarantee it will always be error-free. To the fullest extent
          permitted by law, our liability related to the portal is limited to the amount you paid
          for the service in the past 12 months. Nothing in these terms limits liability that
          cannot be limited by law.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Changes and termination</h2>
        <p className="mt-2">
          We may update these terms as the portal evolves; we&rsquo;ll update the date above and,
          for significant changes, let you know in the app. You can stop using the portal at any
          time and may request deletion of your data (see the{" "}
          <Link href="/privacy" className="text-brand underline">Privacy Policy</Link>).
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-stone-900">Governing law and contact</h2>
        <p className="mt-2">
          These terms are governed by the laws of the State of Minnesota.
        </p>
        <p className="mt-2">
          {BUSINESS_NAME}
          <br />
          {BUSINESS_ADDRESS}
          <br />
          {BUSINESS_PHONE} · {BUSINESS_EMAIL}
        </p>
      </section>
    </article>
  );
}
