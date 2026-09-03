import Link from "next/link";
import { notFound } from "next/navigation";
import AgentDraft from "@/components/leads/AgentDraft";
import { StatusBadge, TemperatureBadge } from "@/components/leads/LeadBadges";
import RetrySend from "@/components/leads/RetrySend";
import SmsComposer from "@/components/leads/SmsComposer";
import TimeOnLead from "@/components/leads/TimeOnLead";
import TrialBookings from "@/components/leads/TrialBookings";
import ConvertLeadForm from "@/components/members/ConvertLeadForm";
import { requireCoach } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime, formatRelative } from "@/lib/format";
import {
  draftAgentReplyAction,
  enrollLeadAction,
  investigateLeadAction,
  optOutLeadAction,
  pauseLeadAction,
  resumeLeadAction,
  setLeadStatusAction,
} from "@/lib/leadActions";
import { upcomingClasses } from "@/lib/leads/agent";
import { getBotConfig } from "@/lib/leads/config";
import { RETRYABLE_STATUSES, UNDELIVERED_STATUSES } from "@/lib/leads/messageStatus";
import { formatPhone } from "@/lib/leads/phone";
import { twilioConfigured } from "@/lib/leads/sms";

export const dynamic = "force-dynamic";

const STATUS_ACTIONS = [
  { status: "ENGAGED", label: "In conversation" },
  { status: "BOOKED", label: "Trial booked" },
  { status: "WON", label: "Signed up" },
  { status: "LOST", label: "Not interested" },
];

function gap(from: Date, to: Date) {
  const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) return `${(minutes / 60).toFixed(1)} h`;
  return `${Math.round(minutes / (60 * 24))} d`;
}

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
      trials: {
        include: { session: { include: { template: true } } },
        orderBy: { session: { startsAt: "asc" } },
      },
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
  const config = await getBotConfig();
  const bookableClasses = await upcomingClasses("", lead.ageGroup, config.timezone, 24);
  const classLabels = new Map(bookableClasses.map((option) => [option.id, option.label]));
  const now = new Date();
  const trials = lead.trials.map((trial) => ({
    id: trial.id,
    status: trial.status,
    bookedBy: trial.bookedBy,
    inPast: trial.session.startsAt < now,
    label: `${trial.session.template.name} — ${formatDateTime(trial.session.startsAt)}`,
  }));
  const drafts = lead.messages.filter((message) => message.status === "DRAFT");
  const thread = lead.messages.filter((message) => message.status !== "DRAFT");
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
          <h1 className="page-title">{lead.fullName}</h1>
          <StatusBadge status={lead.status} />
          {lead.insight && (
            <TemperatureBadge temperature={lead.insight.temperature} score={lead.insight.score} />
          )}
        </div>
        <p className="mt-1 break-anywhere text-slate-600">
          <a href={`tel:${lead.phone}`} className="hover:underline">
            {formatPhone(lead.phone)}
          </a>
          {lead.email && ` · ${lead.email}`} · {lead.source.toLowerCase().replace("_", " ")}
          {lead.campaign && ` · ${lead.campaign}`}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Enquired {formatRelative(lead.submittedAt, now)}
          {lead.firstContactedAt
            ? ` · first text ${gap(lead.submittedAt, lead.firstContactedAt)} later`
            : " · not texted yet"}
        </p>
      </div>

      <section className="card p-4">
        <div className="card-head">
          <h2 className="card-title">Investigation</h2>
          <div className="flex items-center gap-2 text-xs text-slate-500">
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
                className="btn btn-secondary btn-sm"
              >
                Re-investigate
              </button>
            </form>
          </div>
        </div>
        {lead.insight ? (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-slate-700">{lead.insight.summary}</p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="eyebrow">
                  What they want
                </dt>
                <dd className="mt-1">{lead.insight.intent || "—"}</dd>
              </div>
              <div>
                <dt className="eyebrow">
                  Recommended program
                </dt>
                <dd className="mt-1">{lead.insight.recommendedProgram || "—"}</dd>
              </div>
              <div>
                <dt className="eyebrow">
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
                <dt className="eyebrow">
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
          <p className="mt-2 text-sm text-slate-600">Not investigated yet.</p>
        )}
        {(lead.interest || lead.notes || answers.length > 0) && (
          <div className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-sm text-slate-600">
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

      {lead.handoffAt && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">The agent wants a human here</h2>
          <p className="mt-1 text-sm text-amber-800">
            {lead.handoffReason || "It hit something outside what it's allowed to answer."}
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Flagged {formatRelative(lead.handoffAt, now)}. Sending a reply below clears the flag.
          </p>
        </section>
      )}

      <section className="card p-4">
        <div className="card-head">
          <h2 className="card-title">Conversation</h2>
          {!lead.optedOutAt && (
            <form action={draftAgentReplyAction.bind(null, lead.id)}>
              <button
                type="submit"
                className="btn btn-secondary btn-sm"
              >
                Ask the agent for a reply
              </button>
            </form>
          )}
        </div>
        {thread.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No texts yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {thread.map((message) => {
              const undelivered = UNDELIVERED_STATUSES.includes(message.status);
              return (
                <li
                  key={message.id}
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-card ${
                    message.direction === "INBOUND"
                      ? "bg-slate-100 text-slate-800"
                      : undelivered
                        ? "ml-auto border border-red-200 bg-red-50 text-slate-800"
                        : "ml-auto bg-brand text-white"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-anywhere">{message.body}</p>
                  <p
                    className={`mt-1 text-xs ${
                      message.direction === "INBOUND" || undelivered
                        ? "text-slate-500"
                        : "text-white/70"
                    }`}
                  >
                    {formatDateTime(message.createdAt)}
                    {message.direction === "OUTBOUND" &&
                      (message.automated
                        ? ` · ${message.agentAction ? "agent" : "bot"}${message.stepOrder ? ` step ${message.stepOrder}` : ""}`
                        : ` · ${message.sentBy ?? "staff"}`)}
                    {message.provider === "MOCK" && !undelivered && " · not delivered (no Twilio)"}
                  </p>
                  {undelivered && (
                    <p className="mt-1 text-xs font-medium text-red-700">
                      {message.status === "BLOCKED"
                        ? `Held before sending — ${message.errorText}`
                        : message.status === "FAILED"
                          ? `Not delivered — ${message.errorText}`
                          : "Sending…"}
                    </p>
                  )}
                  {RETRYABLE_STATUSES.includes(message.status) && (
                    <RetrySend leadId={lead.id} messageId={message.id} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {drafts.length > 0 && (
          <div className="mt-4 space-y-3">
            {drafts.map((draft) => (
              <AgentDraft
                key={draft.id}
                leadId={lead.id}
                messageId={draft.id}
                body={draft.body}
                action={draft.agentAction}
                reason={draft.errorText}
                booksClass={
                  draft.proposedSessionId ? (classLabels.get(draft.proposedSessionId) ?? null) : null
                }
              />
            ))}
          </div>
        )}

        <div className="mt-4 border-t border-slate-200 pt-4">
          <SmsComposer
            leadId={lead.id}
            suggestion={thread.length === 0 ? lead.insight?.suggestedFirstText : undefined}
            allowSimulatedReply={!twilioConfigured()}
            disabled={Boolean(lead.optedOutAt)}
          />
        </div>
      </section>

      <TrialBookings leadId={lead.id} bookings={trials} classes={bookableClasses} />

      <TimeOnLead leadId={lead.id} />

      <section className="card p-4">
        <h2 className="card-title">Follow-up</h2>
        <p className="mt-1 text-sm text-slate-600">
          {lead.optedOutAt
            ? "Stopped — the lead opted out."
            : lead.pausedAt
              ? "Paused. Resume to keep the cadence going."
              : lead.sequenceKey
                ? `On the ${lead.sequenceKey.toLowerCase().replace("_", " ")} cadence, step ${lead.sequenceStep} delivered.`
                : "Not in a cadence."}
        </p>
        {lead.tasks.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
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
                  className="btn btn-primary btn-md"
                >
                  Resume follow-up
                </button>
              </form>
            ) : (
              <form action={pauseLeadAction.bind(null, lead.id)}>
                <button
                  type="submit"
                  className="btn btn-secondary btn-md"
                >
                  Pause follow-up
                </button>
              </form>
            ))}
          {sequences.map((sequence) => (
            <form key={sequence.key} action={enrollLeadAction.bind(null, lead.id, sequence.key)}>
              <button
                type="submit"
                className="btn btn-secondary btn-md"
              >
                Restart: {sequence.name} ({sequence.steps.length} texts)
              </button>
            </form>
          ))}
        </div>

        <div className="mt-4 border-t border-slate-200 pt-3">
          <p className="eyebrow">Outcome</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {STATUS_ACTIONS.map((action) => (
              <form
                key={action.status}
                action={setLeadStatusAction.bind(null, lead.id, action.status)}
              >
                <button
                  type="submit"
                  disabled={lead.status === action.status}
                  className="btn btn-secondary btn-md"
                >
                  {action.label}
                </button>
              </form>
            ))}
            {!lead.optedOutAt && (
              <form action={optOutLeadAction.bind(null, lead.id)}>
                <button
                  type="submit"
                  className="btn btn-danger btn-md"
                >
                  Do not text
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="card-title">Membership</h2>
        {lead.profile ? (
          <p className="mt-2 text-sm text-slate-600">
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
            <p className="mt-1 text-xs text-slate-500">
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

      <section className="card p-4">
        <h2 className="card-title">Timeline</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {lead.events.map((event) => (
            <li key={event.id} className="border-l-2 border-slate-200 pl-3">
              <p className="font-medium text-slate-800">{event.summary}</p>
              {event.detail && <p className="text-slate-600">{event.detail}</p>}
              <p className="text-xs text-slate-500">{formatDateTime(event.createdAt)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
