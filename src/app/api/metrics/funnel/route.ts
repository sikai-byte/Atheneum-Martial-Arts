import { NextResponse } from "next/server";
import { funnelMetrics, sourceEconomics, windowFor } from "@/lib/analytics/funnel";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The same numbers the Growth page shows, as JSON, so they can be pulled into a spreadsheet or a
 * dashboard later without scraping HTML. Open to signed-in coaches, or to a script holding
 * `CRON_SECRET`.
 *
 * `?days=30` (default, `all` for everything) and `?history=1` to include the daily snapshots.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret");

  if (!secret || provided !== secret) {
    const user = await getCurrentUser();
    if (!user || (user.role !== "COACH" && user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const daysParam = url.searchParams.get("days");
  const days = daysParam === "all" ? null : Number(daysParam ?? 30) || 30;
  const window = windowFor(days);

  const [metrics, economics, history] = await Promise.all([
    funnelMetrics(window),
    sourceEconomics(window),
    url.searchParams.get("history")
      ? prisma.metricSnapshot.findMany({ orderBy: { capturedOn: "desc" }, take: 180 })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    metrics,
    economics,
    history: history.map((row) => ({
      capturedOn: row.capturedOn,
      windowDays: row.windowDays,
      metrics: JSON.parse(row.payload) as unknown,
    })),
  });
}
