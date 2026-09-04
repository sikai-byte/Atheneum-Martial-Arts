import { prisma } from "../db";
import { hashIp } from "./webchatFlow";

/**
 * Limits for the one endpoint in this app the internet can reach without logging in. They are
 * counted in the database rather than in memory on purpose: the app runs behind a platform that
 * can start a second instance at any time, and a per-process counter silently doubles every limit
 * when it does.
 */

export const MAX_CHATS_PER_IP_PER_HOUR = 5;
export const MAX_MESSAGES_PER_IP_PER_HOUR = 40;
export const MAX_MESSAGE_LENGTH = 1000;

export type LimitVerdict = { ok: true } | { ok: false; reason: string; retryAfter: number };

const OK: LimitVerdict = { ok: true };

function anHourAgo(now: Date) {
  return new Date(now.getTime() - 60 * 60 * 1000);
}

/** Guards chat creation, which is the cheap way to sidestep a per-chat turn limit. */
export async function checkStartLimit(ip: string, now = new Date()): Promise<LimitVerdict> {
  if (!ip) return OK;
  const chats = await prisma.webChat.count({
    where: { ipHash: hashIp(ip), createdAt: { gte: anHourAgo(now) } },
  });
  return chats < MAX_CHATS_PER_IP_PER_HOUR
    ? OK
    : {
        ok: false,
        reason: "That's a lot of conversations at once. Try again a little later, or call the studio.",
        retryAfter: 600,
      };
}

export async function checkMessageLimit(
  chatId: string,
  ip: string,
  maxTurns: number,
  now = new Date(),
): Promise<LimitVerdict> {
  const chat = await prisma.webChat.findUnique({ where: { id: chatId } });
  if (!chat) return { ok: false, reason: "That conversation has expired.", retryAfter: 0 };

  if (chat.messageCount >= maxTurns) {
    return {
      ok: false,
      reason: "We've covered a lot here — leave your details and a coach will pick it up with you.",
      retryAfter: 0,
    };
  }

  if (ip) {
    const messages = await prisma.webChatMessage.count({
      where: {
        role: "VISITOR",
        createdAt: { gte: anHourAgo(now) },
        chat: { ipHash: hashIp(ip) },
      },
    });
    if (messages >= MAX_MESSAGES_PER_IP_PER_HOUR) {
      return {
        ok: false,
        reason: "You've hit the hourly limit for this chat. Try again later, or call the studio.",
        retryAfter: 600,
      };
    }
  }

  return OK;
}

/**
 * Origins allowed to call the public endpoint. Without an allowlist any site could embed the widget
 * and spend the studio's model budget. `WEB_CHAT_ORIGINS` is a comma-separated list.
 */
export function allowedOrigins(): string[] {
  const configured = (process.env.WEB_CHAT_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  return [...configured, ...(base ? [base] : [])];
}

/**
 * Returns the CORS headers for a request, or null when the origin is not allowed. A request with no
 * `Origin` header is same-origin (the embed page itself), which is always fine.
 */
export function corsHeaders(request: Request): Record<string, string> | null {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  const allowed = allowedOrigins();
  // An unconfigured allowlist is a development convenience, never a production one: in production
  // it would let any site on the internet embed the widget and spend the studio's model budget.
  if (allowed.length === 0) {
    if (process.env.NODE_ENV === "production") return null;
    return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  }
  if (!allowed.includes(origin.replace(/\/$/, ""))) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

/** Best-effort client IP behind the platform proxy. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
}
