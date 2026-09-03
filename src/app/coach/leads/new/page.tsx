import Link from "next/link";
import NewLeadForm from "@/components/leads/NewLeadForm";
import { requireCoach } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewLeadPage() {
  await requireCoach();
  const sequences = await prisma.sequence.findMany({
    where: { active: true },
    select: { key: true, name: true },
    orderBy: { key: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/coach/leads" className="text-sm text-brand hover:underline">
          ← Leads
        </Link>
        <h1 className="page-title mt-2">Add a lead</h1>
        <p className="mt-1 text-slate-600">
          The bot investigates the lead, drafts a personalized opener, and texts it immediately.
        </p>
      </div>
      <div className="card p-4">
        <NewLeadForm sequences={sequences} />
      </div>
    </div>
  );
}
