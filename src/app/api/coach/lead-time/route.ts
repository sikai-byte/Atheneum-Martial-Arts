import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordStaffTouch } from "@/lib/leads/engine";

export const dynamic = "force-dynamic";

/**
 * Activity beacon from the lead page. `navigator.sendBeacon` cannot be a server action, so this is
 * a route: it takes the seconds a coach was actually looking at a lead and stores them, which is
 * what makes "staff minutes per lead" a measurement rather than a guess.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "COACH" && user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { leadId, seconds } = body as { leadId?: unknown; seconds?: unknown };
  if (typeof leadId !== "string" || typeof seconds !== "number") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  await recordStaffTouch(leadId, user.name, seconds);
  return NextResponse.json({ ok: true });
}
