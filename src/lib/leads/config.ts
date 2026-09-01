import { prisma } from "../db";

export type BotSettings = Awaited<ReturnType<typeof getBotConfig>>;

export async function getBotConfig() {
  const existing = await prisma.botConfig.findUnique({ where: { id: "default" } });
  if (existing) return existing;
  return prisma.botConfig.create({ data: { id: "default" } });
}

function localHour(at: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).format(at);
  return Number(formatted) % 24;
}

export function isQuietHour(
  at: Date,
  config: { timezone: string; quietHoursStart: number; quietHoursEnd: number },
): boolean {
  const { quietHoursStart: start, quietHoursEnd: end } = config;
  if (start === end) return false;
  const hour = localHour(at, config.timezone);
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

/** The next moment at or after `at` that falls outside quiet hours. */
export function nextSendableTime(
  at: Date,
  config: { timezone: string; quietHoursStart: number; quietHoursEnd: number },
): Date {
  let candidate = at;
  for (let i = 0; i < 48 && isQuietHour(candidate, config); i += 1) {
    const next = new Date(candidate);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(next.getUTCHours() + 1);
    candidate = next;
  }
  return candidate;
}
