import crypto from "crypto";
import { NextResponse } from "next/server";
import { handleInboundSms } from "@/lib/leads/engine";

export const dynamic = "force-dynamic";

/**
 * Twilio signs each request with the exact public URL it called plus the sorted POST body.
 * Set PUBLIC_BASE_URL when running behind a proxy so the signature can be reproduced.
 */
function validateTwilioSignature(url: string, params: Record<string, string>, signature: string | null) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || process.env.TWILIO_VALIDATE_SIGNATURE === "false") return true;
  if (!signature) return false;
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = crypto.createHmac("sha1", token).update(payload).digest("base64");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(signature, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function twiml(body = "") {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    params[key] = String(value);
  });

  const requestUrl = process.env.PUBLIC_BASE_URL
    ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, "")}/api/webhooks/twilio/sms`
    : request.url;
  if (!validateTwilioSignature(requestUrl, params, request.headers.get("x-twilio-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const from = params.From ?? "";
  const body = params.Body ?? "";
  if (!from) return twiml();

  try {
    const result = await handleInboundSms(from, body);
    if (!result.matched) console.warn(`[twilio-webhook] no lead matches ${from}`);
  } catch (error) {
    console.error("[twilio-webhook] failed to handle inbound sms", error);
  }

  // Replies are sent by the engine (so they're logged), so the webhook returns empty TwiML.
  return twiml();
}
