import { NextResponse } from "next/server";
import { dispatchDueFollowUps } from "@/lib/leads/engine";

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
  const summary = await dispatchDueFollowUps();
  return NextResponse.json({ ranAt: new Date().toISOString(), ...summary });
}

export async function GET(request: Request) {
  return tick(request);
}

export async function POST(request: Request) {
  return tick(request);
}
