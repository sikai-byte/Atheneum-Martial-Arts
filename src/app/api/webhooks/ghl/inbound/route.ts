import crypto from "crypto";
import { NextResponse } from "next/server";
import { handleInboundSms } from "@/lib/leads/engine";

export const dynamic = "force-dynamic";

type GhlInboundPayload = {
  type?: string;
  messageType?: string;
  message?: string | { body?: string; direction?: string };
  body?: string;
  phone?: string;
  contact?: { phone?: string };
  contact_phone?: string;
  direction?: string;
};

/**
 * HighLevel workflow webhooks don't sign their payloads, so the endpoint is protected by a shared
 * secret in the URL or an Authorization header instead.
 */
function authorized(request: Request) {
  const expected = process.env.GHL_WEBHOOK_SECRET;
  if (!expected) return true;
  const provided =
    new URL(request.url).searchParams.get("secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function readPhone(payload: GhlInboundPayload) {
  return payload.phone ?? payload.contact?.phone ?? payload.contact_phone ?? "";
}

function readBody(payload: GhlInboundPayload) {
  if (typeof payload.message === "string") return payload.message;
  return payload.message?.body ?? payload.body ?? "";
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  let payload: GhlInboundPayload;
  try {
    payload = (await request.json()) as GhlInboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Workflows can fire on outbound messages too; those are already recorded when we send them.
  const direction =
    typeof payload.message === "object" ? payload.message?.direction : payload.direction;
  if (direction && direction.toLowerCase() !== "inbound") {
    return NextResponse.json({ ignored: "outbound" });
  }

  const phone = readPhone(payload);
  const body = readBody(payload);
  if (!phone || !body) {
    return NextResponse.json({ error: "Missing phone or message" }, { status: 400 });
  }

  try {
    const result = await handleInboundSms(phone, body, "GHL");
    if (!result.matched) console.warn(`[ghl-webhook] no lead matches ${phone}`);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[ghl-webhook] failed to handle inbound sms", error);
    return NextResponse.json({ error: "Failed to handle message" }, { status: 500 });
  }
}
