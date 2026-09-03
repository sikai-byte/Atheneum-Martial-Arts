import Link from "next/link";
import { requireCoach } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatRelative } from "@/lib/format";
import { getBotConfig } from "@/lib/leads/config";
import { llmConfigured } from "@/lib/leads/llm";
import { aiRepliesToday } from "@/lib/leads/webchat";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "handoff", label: "Needs a coach" },
  { key: "captured", label: "Became a lead" },
  { key: "open", label: "Still browsing" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function whereForFilter(filter: FilterKey) {
  switch (filter) {
    case "handoff":
      return { status: "HANDOFF" };
    case "captured":
      return { status: "CAPTURED" };
    case "open":
      return { status: "OPEN", leadId: null };
    default:
      return {};
  }
}

export default async function WebChatsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  await requireCoach();
  const filter = (FILTERS.find((f) => f.key === searchParams.filter)?.key ?? "all") as FilterKey;
  const dayAgo = new Date(Date.now() - 86_400_000);

  const [chats, config, today, needCoach, captured, aiToday] = await Promise.all([
    prisma.webChat.findMany({
      where: { ...whereForFilter(filter), messageCount: { gt: 0 } },
      include: {
        lead: { select: { id: true, fullName: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    getBotConfig(),
    prisma.webChat.count({ where: { createdAt: { gte: dayAgo }, messageCount: { gt: 0 } } }),
    prisma.webChat.count({ where: { status: "HANDOFF" } }),
    prisma.webChat.count({ where: { status: "CAPTURED" } }),
    aiRepliesToday(),
  ]);

  const stats = [
    { label: "Conversations (24 h)", value: String(today) },
    { label: "Waiting on a coach", value: String(needCoach) },
    { label: "Became leads", value: String(captured) },
    { label: "Bot replies today", value: `${aiToday} / ${config.webChatDailyCap}` },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Website chats</h1>
          <p className="mt-1 text-slate-600">
            The bot on the website answers from the same knowledge base as the texting agent. A
            visitor becomes a lead the moment they leave their details.
          </p>
        </div>
        <Link href="/coach/leads/settings" className="btn btn-secondary btn-md">
          Bot settings
        </Link>
      </section>

      {!config.webChatEnabled && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The website chat is turned off, so the widget shows but cannot reply. Turn it back on in
          bot settings.
        </p>
      )}
      {!llmConfigured() && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          No LLM key set — the widget still works, but every reply offers a coach instead of
          answering.
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-4">
            <p className="eyebrow">{stat.label}</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">
              {stat.value}
            </p>
          </div>
        ))}
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Chat filters">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/coach/chats" : `/coach/chats?filter=${f.key}`}
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

      {chats.length === 0 ? (
        <p className="card p-4 text-slate-600">
          No website conversations yet. Add
          <code className="mx-1 rounded bg-slate-100 px-1">
            &lt;script src=&quot;/widget.js&quot; async&gt;&lt;/script&gt;
          </code>
          to the website to put the chat bubble on it.
        </p>
      ) : (
        <ul className="space-y-3">
          {chats.map((chat) => (
            <li key={chat.id}>
              <Link href={`/coach/chats/${chat.id}`} className="block card p-4 hover:border-slate-400">
                <div className="card-head">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">
                      {chat.visitorName || chat.lead?.fullName || "Anonymous visitor"}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        chat.status === "HANDOFF"
                          ? "bg-amber-100 text-amber-900"
                          : chat.status === "CAPTURED"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {chat.status === "HANDOFF"
                        ? "Needs a coach"
                        : chat.status === "CAPTURED"
                          ? "Became a lead"
                          : "Browsing"}
                    </span>
                    {chat.consentAt && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-brand">
                        Consented to texts
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{formatRelative(chat.updatedAt)}</p>
                </div>
                {chat.messages[0] && (
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                    {chat.messages[0].role === "VISITOR" ? "They said: " : "Bot: "}
                    {chat.messages[0].body}
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  {chat.messageCount} message{chat.messageCount === 1 ? "" : "s"}
                  {chat.interest ? ` · ${chat.interest}` : ""}
                  {chat.pageUrl ? ` · ${chat.pageUrl}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
