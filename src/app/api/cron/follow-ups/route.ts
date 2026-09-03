import { NextResponse } from "next/server";
import { captureSnapshot } from "@/lib/analytics/funnel";
import { getBotConfig } from "@/lib/leads/config";
import { dispatchDueFollowUps } from "@/lib/leads/engine";
import { retryStuckOutbound } from "@/lib/leads/outbox";
import { ensureUpcomingSessions } from "@/lib/schedule/rollout";

export const dynamic = "force-dynamic";

/**
 * Dispatcher tick. Run this every minute (Railway cron, Vercel cron, or any scheduler) — it is
 * what guarantees the 5-minute first-touch promise even if the intake request path failed.
 */
async function tick(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    const url = new URL(request.url);
    const provided = header?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const sessionsCreated = await ensureUpcomingSessions();
  const summary = await dispatchDueFollowUps();
  // A provider blip shouldn't need a coach to notice it: anything left failed or mid-flight gets
  // another bounded attempt here before it parks for staff.
  const outbox = await retryStuckOutbound();
  const config = await getBotConfig();
  const snapshot = await captureSnapshot({ timezone: config.timezone });
  return NextResponse.json({
    ranAt: new Date().toISOString(),
    sessionsCreated,
    ...summary,
    outbox,
    snapshot,
  });
}

export async function GET(request: Request) {
  return tick(request);
}

export async function POST(request: Request) {
  return tick(request);
}
