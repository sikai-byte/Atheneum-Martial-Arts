import { NextResponse } from "next/server";
import { getBotConfig } from "@/lib/leads/config";
import { LeadInputError } from "@/lib/leads/engine";
import { SMS_CONSENT_TEXT } from "@/lib/leads/webchat";
import { captureWebChatContact, replyToVisitor, startWebChat } from "@/lib/leads/webchatFlow";
import {
  checkMessageLimit,
  checkStartLimit,
  clientIp,
  corsHeaders,
  MAX_MESSAGE_LENGTH,
} from "@/lib/leads/webchatLimits";

export const dynamic = "force-dynamic";

/**
 * The website chat bot's only endpoint. Public, so it is rate limited by IP and by conversation,
 * scoped to allowed origins, and capped in bot settings — a visitor gets a helpful reply, a
 * scraper gets a 429 rather than a bill.
 */

type ChatRequest = {
  action?: "start" | "message" | "capture";
  chatId?: string;
  message?: string;
  pageUrl?: string;
  referrer?: string;
  name?: string;
  phone?: string;
  email?: string;
  smsConsent?: boolean;
};

export async function OPTIONS(request: Request) {
  const cors = corsHeaders(request);
  if (!cors) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: Request) {
  const cors = corsHeaders(request);
  if (!cors) return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });

  const config = await getBotConfig();
  if (!config.webChatEnabled) {
    return NextResponse.json({ error: "Chat is turned off right now." }, { status: 503, headers: cors });
  }

  let payload: ChatRequest;
  try {
    payload = (await request.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400, headers: cors });
  }

  const ip = clientIp(request);

  try {
    if (payload.action === "start") {
      const limit = await checkStartLimit(ip);
      if (!limit.ok) {
        return NextResponse.json(
          { error: limit.reason },
          { status: 429, headers: { ...cors, "Retry-After": String(limit.retryAfter) } },
        );
      }
      const { chat, greeting } = await startWebChat({
        pageUrl: payload.pageUrl,
        referrer: payload.referrer,
        ip,
      });
      return NextResponse.json(
        { chatId: chat.id, message: greeting, consentText: SMS_CONSENT_TEXT },
        { headers: cors },
      );
    }

    if (payload.action === "message") {
      if (!payload.chatId) {
        return NextResponse.json({ error: "Missing chatId." }, { status: 400, headers: cors });
      }
      const body = (payload.message ?? "").slice(0, MAX_MESSAGE_LENGTH);
      if (!body.trim()) {
        return NextResponse.json({ error: "Say something first." }, { status: 400, headers: cors });
      }
      const limit = await checkMessageLimit(payload.chatId, ip, config.webChatMaxTurns);
      if (!limit.ok) {
        return NextResponse.json(
          { error: limit.reason, askForContact: true },
          { status: 429, headers: { ...cors, "Retry-After": String(limit.retryAfter) } },
        );
      }
      const turn = await replyToVisitor(payload.chatId, body);
      return NextResponse.json(
        {
          message: turn.reply.body,
          action: turn.reply.action,
          askForContact: turn.askForContact,
          consentText: SMS_CONSENT_TEXT,
        },
        { headers: cors },
      );
    }

    if (payload.action === "capture") {
      if (!payload.chatId) {
        return NextResponse.json({ error: "Missing chatId." }, { status: 400, headers: cors });
      }
      await captureWebChatContact({
        chatId: payload.chatId,
        name: payload.name ?? "",
        phone: payload.phone,
        email: payload.email,
        smsConsent: payload.smsConsent === true,
      });
      return NextResponse.json(
        {
          message:
            payload.smsConsent === true
              ? "Got it — a coach will text you shortly to sort out your free class."
              : "Got it — a coach will get back to you shortly about your free class.",
        },
        { headers: cors },
      );
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: cors });
  } catch (error) {
    if (error instanceof LeadInputError) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: cors });
    }
    console.error("[api/chat] failed", error);
    return NextResponse.json(
      { error: "Something went wrong on our side. Please call the studio." },
      { status: 500, headers: cors },
    );
  }
}
