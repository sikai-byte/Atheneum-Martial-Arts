import Link from "next/link";
import KnowledgeEditor from "@/components/leads/KnowledgeEditor";
import { requireCoach } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { KNOWLEDGE_AUDIENCES, KNOWLEDGE_CATEGORIES } from "@/lib/leads/knowledge";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  await requireCoach();
  const items = await prisma.knowledgeItem.findMany({
    orderBy: [{ order: "asc" }, { category: "asc" }, { title: "asc" }],
  });
  const unconfirmed = items.filter((item) => !item.verified).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/coach/leads/settings" className="text-sm text-brand hover:underline">
          ← Bot settings
        </Link>
        <h1 className="page-title mt-2">What the agent knows</h1>
        <p className="mt-1 text-slate-600">
          The agent sells only from what&apos;s written here. It never invents a price, a class time
          or a policy — if the answer isn&apos;t on this page it tells the lead a coach will confirm.
        </p>
      </div>

      {unconfirmed > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {unconfirmed} item{unconfirmed === 1 ? "" : "s"} still need confirming — usually your real
          rates. Until you tick <em>confirmed accurate</em>, the agent hands those questions to a
          coach rather than guessing.
        </p>
      )}

      <div className="card p-4">
        <KnowledgeEditor
          items={items.map((item) => ({
            id: item.id,
            category: item.category,
            title: item.title,
            body: item.body,
            audience: item.audience,
            program: item.program,
            active: item.active,
            verified: item.verified,
          }))}
          categories={KNOWLEDGE_CATEGORIES}
          audiences={KNOWLEDGE_AUDIENCES}
        />
      </div>
    </div>
  );
}
