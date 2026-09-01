import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge, TemperatureBadge } from "@/components/leads/LeadBadges";
import SmsComposer from "@/components/leads/SmsComposer";
import ConvertLeadForm from "@/components/members/ConvertLeadForm";
import { requireCoach } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime, formatRelative } from "@/lib/format";
import {
  enrollLeadAction,
  investigateLeadAction,
  optOutLeadAction,
  pauseLeadAction,
  resumeLeadAction,
  setLeadStatusAction,
} from "@/lib/leadActions";
import { formatPhone } from "@/lib/leads/phone";
import { twilioConfigured } from "@/lib/leads/sms";

export const dynamic = "force-dynamic";

const STATUS_ACTIONS = [
  { status: "ENGAGED", label: "In conversation" },
  { status: "BOOKED", label: "Trial booked" },
  { status: "WON", label: "Signed up" },
  { status: "LOST", label: "Not interested" },
];

function lines(value: string) {
  return value.split("\n").map((l) => l.trim()).filter(Boolean);
}

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  await requireCoach();
  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      insight: true,
      messages: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 30 },
      tasks: { where: { status: "PENDING" }, orderBy: { dueAt: "asc" } },
      profile: { select: { id: true, name: true } },
    },
  });
  if (!lead) notFound();

  const [sequences, plans] = await Promise.all([
    prisma.sequence.findMany({
      where: { active: true },
      include: { steps: { orderBy: { order: "asc" } } },
      orderBy: { key: "asc" },
    }),
    prisma.membershipPlan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const now = new Date();
  const answers = (() => {
    try {
      const parsed = JSON.parse(lead.answers) as Record<string, string>;
      return Object.entries(parsed);
    } catch {
      return [];
    }
  })();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/coach/leads" className="text-sm text-brand hover:underline">
          ← Leads
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{lead.fullName}</h1>
          <StatusBadge status={lead.status} />
          {lead.insight && (
            <TemperatureBadge temperature={lead.insight.temperature} score={lead.insight.score} />
          )}
        </div>
        <p className="mt-1 text-stone-600">
          <a href={`tel:${lead.phone}`} className="hover:underline">
            {formatPhone(lead.phone)}
          </a>
          {lead.email && ` · ${lead.email}`} · {lead.source.toLowerCase().replace("_", " ")}
          {lead.campaign && ` · ${lead.campaign}`}
        </p>
        <p className="mt-1 text-sm text-stone-500">
          Enquired {formatRelative(lead.submittedAt, now)}
          {lead.firstContactedAt
            ? ` · first text ${Math.max(
                0,
                Math.round((lead.firstContactedAt.getTime() - lead.submittedAt.getTime()) / 60_000),
              )} min later`
            : " · not texted yet"}
        </p>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Investigation</h2>
          <div className="flex items-center gap-2 text-xs text-stone-500">
            {lead.insight && (
              <span>
                {lead.insight.generatedBy === "AI"
                  ? `AI (${lead.insight.model})`
                  : "Rules engine"}{" "}
                · {formatRelative(lead.insight.updatedAt, now)}
              </span>
            )}
            <form action={investigateLeadAction.bind(null, lead.id)}>
              <button
                type="submit"
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
              >
                Re-investigate
              </button>
            </form>
          </div>
        </div>
        {lead.insight ? (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-stone-700">{lead.insight.summary}</p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  What they want
                </dt>
                <dd className="mt-1">{lead.insight.intent || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Recommended program
                </dt>
                <dd className="mt-1">{lead.insight.recommendedProgram || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Talking points
                </dt>
                <dd className="mt-1">
                  <ul className="list-disc space-y-1 pl-4">
                    {lines(lead.insight.talkingPoints).map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Likely objections
                </dt>
                <dd className="mt-1">
                  <ul className="list-disc space-y-1 pl-4">
                    {lines(lead.insight.objections).map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-600">Not investigated yet.</p>
        )}
        {(lead.interest || lead.notes || answers.length > 0) && (
          <div className="mt-4 space-y-1 border-t border-stone-200 pt-3 text-sm text-stone-600">
            {lead.interest && <p>Stated interest: {lead.interest}</p>}
            {lead.notes && <p>Staff notes: {lead.notes}</p>}
            {answers.map(([key, value]) => (
              <p key={key}>
                {key.replace(/_/g, " ")}: {String(value)}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">Conversation</h2>
        {lead.messages.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">No texts yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {lead.messages.map((message) => (
              <li
                key={message.id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  message.direction === "INBOUND"
                    ? "bg-stone-100 text-stone-800"
                    : "ml-auto bg-brand text-white"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.body}</p>
                <p
                  className={`mt-1 text-xs ${
                    message.direction === "INBOUND" ? "text-stone-500" : "text-white/70"
                  }`}
                >
                  {formatDateTime(message.createdAt)}
                  {message.direction === "OUTBOUND" &&
                    (message.automated
                      ? ` · bot${message.stepOrder ? ` step ${message.stepOrder}` : ""}`
                      : ` · ${message.sentBy ?? "staff"}`)}
                  {message.provider === "MOCK" && " · not delivered (no Twilio)"}
                  {message.status === "FAILED" && ` · failed: ${message.errorText}`}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 border-t border-stone-200 pt-4">
          <SmsComposer
            leadId={lead.id}
            suggestion={lead.messages.length === 0 ? lead.insight?.suggestedFirstText : undefined}
            allowSimulatedReply={!twilioConfigured()}
            disabled={Boolean(lead.optedOutAt)}
          />
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">Follow-up</h2>
        <p className="mt-1 text-sm text-stone-600">
          {lead.optedOutAt
            ? "Stopped — the lead opted out."
            : lead.pausedAt
              ? "Paused. Resume to keep the cadence going."
              : lead.sequenceKey
                ? `On the ${lead.sequenceKey.toLowerCase().replace("_", " ")} cadence, step ${lead.sequenceStep} delivered.`
                : "Not in a cadence."}
        </p>
        {lead.tasks.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-stone-600">
            {lead.tasks.map((task) => (
              <li key={task.id}>
                Step {task.stepOrder} queued for {formatDateTime(task.dueAt)} (
                {formatRelative(task.dueAt, now)})
                {task.lastError && ` · last error: ${task.lastError}`}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {!lead.optedOutAt &&
            (lead.pausedAt ? (
              <form action={resumeLeadAction.bind(null, lead.id)}>
                <button
                  type="submit"
                  className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-dark"
                >
                  Resume follow-up
                </button>
              </form>
            ) : (
              <form action={pauseLeadAction.bind(null, lead.id)}>
                <button
                  type="submit"
                  className="rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
                >
                  Pause follow-up
                </button>
              </form>
            ))}
          {sequences.map((sequence) => (
            <form key={sequence.key} action={enrollLeadAction.bind(null, lead.id, sequence.key)}>
              <button
                type="submit"
                className="rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
              >
                Restart: {sequence.name} ({sequence.steps.length} texts)
              </button>
            </form>
          ))}
        </div>

        <div className="mt-4 border-t border-stone-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Outcome</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {STATUS_ACTIONS.map((action) => (
              <form
                key={action.status}
                action={setLeadStatusAction.bind(null, lead.id, action.status)}
              >
                <button
                  type="submit"
                  disabled={lead.status === action.status}
                  className="rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                >
                  {action.label}
                </button>
              </form>
            ))}
            {!lead.optedOutAt && (
              <form action={optOutLeadAction.bind(null, lead.id)}>
                <button
                  type="submit"
                  className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                >
                  Do not text
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">Membership</h2>
        {lead.profile ? (
          <p className="mt-2 text-sm text-stone-600">
            Signed up as{" "}
            <Link
              href={`/coach/members/${lead.profile.id}`}
              className="font-medium text-brand underline"
            >
              {lead.profile.name}
            </Link>
            . Dues and lifetime value live on the member record.
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-stone-500">
              Creating the member keeps this lead attached, so every payment they make is credited
              back to {lead.source.toLowerCase().replace("_", " ")}
              {lead.campaign && ` · ${lead.campaign}`}.
            </p>
            <div className="mt-3">
              <ConvertLeadForm
                leadId={lead.id}
                defaultName={(lead.ageGroup === "KID" ? lead.childName : lead.fullName) || lead.fullName}
                defaultEmail={lead.email ?? ""}
                defaultIsChild={lead.ageGroup === "KID"}
                plans={plans}
              />
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">Timeline</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {lead.events.map((event) => (
            <li key={event.id} className="border-l-2 border-stone-200 pl-3">
              <p className="font-medium text-stone-800">{event.summary}</p>
              {event.detail && <p className="text-stone-600">{event.detail}</p>}
              <p className="text-xs text-stone-500">{formatDateTime(event.createdAt)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
