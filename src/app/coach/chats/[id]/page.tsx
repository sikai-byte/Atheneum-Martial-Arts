import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/leads/phone";
import { webChatWithMessages } from "@/lib/leads/webchatFlow";

export const dynamic = "force-dynamic";

export default async function WebChatPage({ params }: { params: { id: string } }) {
  await requireCoach();
  const chat = await webChatWithMessages(params.id);
  if (!chat) notFound();

  return (
    <div className="space-y-6">
      <section>
        <Link href="/coach/chats" className="text-sm font-medium text-brand hover:underline">
          ← Website chats
        </Link>
        <h1 className="page-title mt-2">
          {chat.visitorName || chat.lead?.fullName || "Anonymous visitor"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Started {formatDateTime(chat.createdAt)}
          {chat.pageUrl ? ` on ${chat.pageUrl}` : ""}
        </p>
      </section>

      {chat.handoffAt && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Handed to a coach {formatDateTime(chat.handoffAt)}
          {chat.handoffReason ? ` — ${chat.handoffReason}` : ""}
        </p>
      )}

      <section className="card p-4">
        <h2 className="section-title">Who this is</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="eyebrow">Training for</dt>
            <dd className="mt-0.5">
              {chat.ageGroup === "KID" ? "A child" : chat.ageGroup === "ADULT" ? "Themselves" : "Not said"}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Interest</dt>
            <dd className="mt-0.5">{chat.interest || "Not said"}</dd>
          </div>
          <div>
            <dt className="eyebrow">Lead record</dt>
            <dd className="mt-0.5">
              {chat.lead ? (
                <Link href={`/coach/leads/${chat.lead.id}`} className="font-medium text-brand hover:underline">
                  {chat.lead.fullName} · {formatPhone(chat.lead.phone)}
                </Link>
              ) : (
                "No contact details yet"
              )}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Consent to text</dt>
            <dd className="mt-0.5">
              {chat.consentAt
                ? `Given ${formatDateTime(chat.consentAt)}`
                : chat.lead
                  ? "Not given — call or email instead, nothing is queued"
                  : "Not given"}
            </dd>
          </div>
        </dl>
        {chat.consentText && (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            Wording they agreed to: “{chat.consentText}”
          </p>
        )}
      </section>

      <section className="card p-4">
        <h2 className="section-title">Conversation</h2>
        <ul className="mt-3 space-y-3">
          {chat.messages.map((message) => (
            <li
              key={message.id}
              className={
                message.role === "VISITOR"
                  ? "max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-sm"
                  : "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-3 py-2 text-sm text-white"
              }
            >
              {/* A visitor can paste a thousand characters with no spaces in them. */}
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
              <p
                className={`mt-1 text-[11px] ${
                  message.role === "VISITOR" ? "text-slate-500" : "text-blue-100"
                }`}
              >
                {formatDateTime(message.createdAt)}
                {message.role !== "VISITOR" && ` · ${message.action.toLowerCase()}`}
                {message.generatedBy === "RULES" && message.role !== "VISITOR" && " · rules"}
              </p>
              {message.reason && (
                <p className="mt-1 text-[11px] italic text-blue-100">Read: {message.reason}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
