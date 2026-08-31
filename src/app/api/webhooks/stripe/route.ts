import { NextResponse } from "next/server";
import { ingestStripeEvent, stripeConfigured, verifyStripeSignature } from "@/lib/members/stripe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  // The raw body is required: Stripe signs the exact bytes it sent.
  const rawBody = await request.text();
  if (!verifyStripeSignature(rawBody, request.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await ingestStripeEvent(event as Parameters<typeof ingestStripeEvent>[0]);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[stripe-webhook] failed to ingest event", error);
    return NextResponse.json({ error: "Failed to ingest event" }, { status: 500 });
  }
}
