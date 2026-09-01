import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime, formatPrice, formatRelative } from "@/lib/format";
import { formatPhone } from "@/lib/leads/phone";
import { monthsBetween } from "@/lib/members/ltv";
import { stripeConfigured } from "@/lib/members/stripe";
import MembershipStatusForm from "@/components/members/MembershipStatusForm";
import PaymentForm from "@/components/members/PaymentForm";

export const dynamic = "force-dynamic";

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { newLogin?: string };
}) {
  await requireCoach();
  const profile = await prisma.memberProfile.findUnique({
    where: { id: params.id },
    include: {
      household: { include: { users: { select: { email: true, role: true } } } },
      lead: { include: { insight: true } },
      memberships: { include: { plan: true }, orderBy: { startedAt: "desc" } },
      payments: { orderBy: { paidAt: "desc" } },
      attendances: { orderBy: { checkedInAt: "desc" }, take: 5, include: { session: true } },
    },
  });
  if (!profile) notFound();

  const now = new Date();
  const current =
    profile.memberships.find((m) => m.status === "ACTIVE" || m.status === "PAST_DUE") ??
    profile.memberships[0] ??
    null;
  const paid = profile.payments.filter((p) => p.status === "PAID");
  const ltvCents = paid.reduce((sum, p) => sum + p.amountCents, 0);
  const months = monthsBetween(profile.joinedAt, profile.leftAt ?? now);
  const lead = profile.lead;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{profile.name}</h1>
          <p className="mt-1 text-stone-600">
            {current ? `${current.plan.name} · ${formatPrice(current.priceCents)}/mo` : "No plan"} ·
            joined {formatRelative(profile.joinedAt, now)}
            {profile.leftAt && ` · left ${formatRelative(profile.leftAt, now)}`}
          </p>
        </div>
        <Link
          href="/coach/members"
          className="rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
        >
          All members
        </Link>
      </section>

      {searchParams.newLogin && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Portal login created. Temporary password:{" "}
          <code className="rounded bg-white px-1 font-semibold">{searchParams.newLogin}</code> —
          give it to them now, it isn&apos;t stored and won&apos;t be shown again.
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Lifetime value", value: formatPrice(ltvCents) },
          { label: "Months with us", value: String(months) },
          {
            label: "Average per month",
            value: formatPrice(months > 0 ? Math.round(ltvCents / months) : 0),
          },
          { label: "Payments recorded", value: String(paid.length) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-bold">{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">Membership</h2>
        {current ? (
          <>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-stone-500">Status</dt>
                <dd className="font-medium">{current.status.toLowerCase().replace("_", " ")}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-stone-500">Started</dt>
                <dd className="font-medium">{formatDateTime(current.startedAt)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-stone-500">Next invoice</dt>
                <dd className="font-medium">
                  {current.nextInvoiceAt ? formatDateTime(current.nextInvoiceAt) : "—"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-stone-500">Stripe subscription</dt>
                <dd className="font-medium">{current.stripeSubscriptionId ?? "not linked"}</dd>
              </div>
            </dl>
            <div className="mt-3 border-t border-stone-200 pt-3">
              <MembershipStatusForm membershipId={current.id} status={current.status} />
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-stone-600">No membership on file.</p>
        )}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">Record a payment</h2>
        <p className="mt-1 text-xs text-stone-500">
          {stripeConfigured()
            ? "Stripe invoices are ingested automatically; use this for cash and card-terminal payments."
            : "Stripe isn't connected yet, so every payment is recorded here by hand."}
        </p>
        <div className="mt-3">
          <PaymentForm profileId={profile.id} />
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">Payment history</h2>
        {profile.payments.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">Nothing collected yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-stone-100 text-sm">
            {profile.payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold">{formatPrice(payment.amountCents)}</span>{" "}
                  {payment.kind.toLowerCase().replace("_", " ")}
                  {payment.description && ` — ${payment.description}`}
                  {payment.status !== "PAID" && (
                    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                      {payment.status.toLowerCase()}
                    </span>
                  )}
                </span>
                <span className="text-stone-500">
                  {formatDateTime(payment.paidAt)} · {payment.method.toLowerCase()} ·{" "}
                  {payment.recordedBy}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">Where they came from</h2>
        {lead ? (
          <div className="mt-2 space-y-1 text-sm text-stone-600">
            <p>
              <Link href={`/coach/leads/${lead.id}`} className="font-medium text-brand underline">
                {lead.fullName}
              </Link>{" "}
              · {formatPhone(lead.phone)} · {lead.source.toLowerCase().replace("_", " ")}
              {lead.campaign && ` · ${lead.campaign}`}
            </p>
            <p>
              Submitted {formatDateTime(lead.submittedAt)}
              {lead.firstContactedAt &&
                ` · first text ${Math.max(
                  0,
                  Math.round(
                    (lead.firstContactedAt.getTime() - lead.submittedAt.getTime()) / 60_000,
                  ),
                )} min later`}
            </p>
            <p>
              Signed up {formatRelative(profile.joinedAt, now)} —{" "}
              {Math.max(
                0,
                Math.round((profile.joinedAt.getTime() - lead.submittedAt.getTime()) / 86_400_000),
              )}{" "}
              days from first inquiry to member.
            </p>
            {lead.insight && (
              <p className="text-stone-500">
                Investigation scored them {lead.insight.score} ({lead.insight.temperature}
                ).
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-600">
            No lead attached — this member predates lead tracking, so their revenue isn&apos;t
            attributed to a source.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">Household</h2>
        <p className="mt-2 text-sm text-stone-600">
          {profile.household.name}
          {profile.household.users.length > 0 &&
            ` · ${profile.household.users.map((u) => u.email).join(", ")}`}
        </p>
        {profile.attendances.length > 0 && (
          <p className="mt-2 text-sm text-stone-600">
            Last check-in {formatRelative(profile.attendances[0].checkedInAt, now)} (
            {profile.attendances[0].session.startsAt.toLocaleDateString("en-US")}).
          </p>
        )}
      </section>
    </div>
  );
}
