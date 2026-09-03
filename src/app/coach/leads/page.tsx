import Link from "next/link";
import { requireCoach } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatRelative } from "@/lib/format";
import { runDispatcherAction } from "@/lib/leadActions";
import { getBotConfig } from "@/lib/leads/config";
import { llmConfigured } from "@/lib/leads/investigate";
import { formatPhone } from "@/lib/leads/phone";
import { twilioConfigured } from "@/lib/leads/sms";
import { StatusBadge, TemperatureBadge } from "@/components/leads/LeadBadges";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "new", label: "Awaiting first text" },
  { key: "engaged", label: "Replied" },
  { key: "handoff", label: "Needs a coach" },
  { key: "working", label: "In sequence" },
  { key: "won", label: "Won" },
  { key: "closed", label: "Closed" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function whereForFilter(filter: FilterKey) {
  switch (filter) {
    case "new":
      return { firstContactedAt: null, optedOutAt: null };
    case "engaged":
      return { status: "ENGAGED" };
    case "handoff":
      return {
        OR: [
          { handoffAt: { not: null } },
          { messages: { some: { status: "DRAFT" } } },
        ],
      };
    case "working":
      return { status: { in: ["CONTACTED", "NEW"] }, tasks: { some: { status: "PENDING" } } };
    case "won":
      return { status: { in: ["BOOKED", "WON"] } };
    case "closed":
      return { status: { in: ["LOST", "UNSUBSCRIBED"] } };
    default:
      return {};
  }
}

export default async function LeadsInboxPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  await requireCoach();
  const filter = (FILTERS.find((f) => f.key === searchParams.filter)?.key ?? "all") as FilterKey;
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86_400_000);

  const [leads, config, newToday, awaitingReply, pendingTasks, contactedLeads, wonCount] =
    await Promise.all([
      prisma.lead.findMany({
        where: whereForFilter(filter),
        include: {
          insight: true,
          tasks: { where: { status: "PENDING" }, orderBy: { dueAt: "asc" }, take: 1 },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 100,
      }),
      getBotConfig(),
      prisma.lead.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.lead.count({ where: { status: "ENGAGED" } }),
      prisma.followUpTask.count({ where: { status: "PENDING" } }),
      prisma.lead.findMany({
        where: { firstContactedAt: { not: null } },
        select: { submittedAt: true, firstContactedAt: true, createdAt: true },
      }),
      prisma.lead.count({ where: { status: { in: ["BOOKED", "WON"] } } }),
    ]);

  // First-response time is measured from lead capture, which is what the 5-minute promise is about.
  const responseMinutes = contactedLeads
    .map((l) =>
      l.firstContactedAt
        ? (l.firstContactedAt.getTime() - Math.max(l.submittedAt.getTime(), 0)) / 60_000
        : null,
    )
    .filter((m): m is number => m !== null && m >= 0);
  const medianResponse = responseMinutes.length
    ? [...responseMinutes].sort((a, b) => a - b)[Math.floor(responseMinutes.length / 2)]
    : null;
  const within5 = responseMinutes.filter((m) => m <= 5).length;

  const stats = [
    { label: "New (24 h)", value: String(newToday) },
    { label: "Replied, needs a human", value: String(awaitingReply) },
    { label: "Follow-ups queued", value: String(pendingTasks) },
    {
      label: "Median first text",
      value: medianResponse === null ? "—" : `${Math.round(medianResponse)} min`,
      hint: responseMinutes.length
        ? `${within5}/${responseMinutes.length} within 5 min`
        : undefined,
    },
    { label: "Booked / won", value: String(wonCount) },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="mt-1 text-slate-600">
            Every new lead gets a text within 5 minutes, then a follow-up cadence until they reply.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/coach/leads/new"
            className="btn btn-primary btn-md"
          >
            Add lead
          </Link>
          <Link
            href="/coach/leads/import"
            className="btn btn-secondary btn-md"
          >
            Import old leads
          </Link>
          <Link
            href="/coach/chats"
            className="btn btn-secondary btn-md"
          >
            Website chats
          </Link>
          <Link
            href="/coach/leads/settings"
            className="btn btn-secondary btn-md"
          >
            Bot settings
          </Link>
          <form action={runDispatcherAction}>
            <button
              type="submit"
              className="btn btn-secondary btn-md"
            >
              Run dispatcher now
            </button>
          </form>
        </div>
      </section>

      {(!config.autopilot || !twilioConfigured() || !llmConfigured()) && (
        <ul className="space-y-2 text-sm">
          {!config.autopilot && (
            <li className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
              Autopilot is off — follow-ups stay queued until you turn it back on in bot settings.
            </li>
          )}
          {!twilioConfigured() && (
            <li className="rounded-lg bg-slate-100 px-3 py-2 text-slate-700">
              Twilio isn&apos;t configured, so texts are recorded but not delivered. Set
              TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to go live.
            </li>
          )}
          {!llmConfigured() && (
            <li className="rounded-lg bg-slate-100 px-3 py-2 text-slate-700">
              No LLM key set — lead investigation is using the built-in rules engine.
            </li>
          )}
        </ul>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-4">
            <p className="eyebrow">
              {stat.label}
            </p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">{stat.value}</p>
            {stat.hint && <p className="text-xs text-slate-500">{stat.hint}</p>}
          </div>
        ))}
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Lead filters">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/coach/leads" : `/coach/leads?filter=${f.key}`}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {leads.length === 0 ? (
        <p className="card p-4 text-slate-600">
          No leads here yet. Add one manually or point your Facebook Lead Ads webhook at
          <code className="mx-1 rounded bg-slate-100 px-1">/api/webhooks/facebook</code>.
        </p>
      ) : (
        <ul className="space-y-3">
          {leads.map((lead) => {
            const nextTask = lead.tasks[0];
            const lastMessage = lead.messages[0];
            return (
              <li key={lead.id}>
                <Link
                  href={`/coach/leads/${lead.id}`}
                  className="block card p-4 hover:border-slate-400"
                >
                  <div className="card-head">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{lead.fullName}</p>
                      <StatusBadge status={lead.status} />
                      {lead.insight && (
                        <TemperatureBadge
                          temperature={lead.insight.temperature}
                          score={lead.insight.score}
                        />
                      )}
                      {lead.pausedAt && !lead.optedOutAt && (
                        <span className="text-xs font-semibold text-slate-500">paused</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">
                      {formatPhone(lead.phone)} · {lead.source.toLowerCase().replace("_", " ")}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {lead.insight?.summary ?? lead.interest ?? "Not investigated yet."}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>Captured {formatRelative(lead.createdAt, now)}</span>
                    {lastMessage && (
                      <span>
                        Last {lastMessage.direction === "INBOUND" ? "reply" : "text"}{" "}
                        {formatRelative(lastMessage.createdAt, now)}
                      </span>
                    )}
                    {nextTask && (
                      <span>
                        Next follow-up (step {nextTask.stepOrder}){" "}
                        {formatRelative(nextTask.dueAt, now)}
                      </span>
                    )}
                    {!nextTask && !lead.optedOutAt && <span>No follow-up queued</span>}
                    {lead.optedOutAt && <span className="text-red-700">Opted out</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
