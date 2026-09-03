import { prisma } from "@/lib/db";
import { nextSendableTime } from "@/lib/leads/config";

/**
 * Empties every table between tests. Discovered from the catalogue rather than listed by hand so a
 * new model can't quietly start leaking rows from one test into the next.
 */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

let phoneCounter = 0;

/** A distinct valid US number per lead, since `Lead.phone` is unique. */
export function nextPhone() {
  phoneCounter += 1;
  return `+1555${String(2_000_000 + phoneCounter)}`;
}

export async function makeLead(overrides: Partial<Parameters<typeof prisma.lead.create>[0]["data"]> = {}) {
  return prisma.lead.create({
    data: {
      fullName: "Test Lead",
      phone: nextPhone(),
      source: "MANUAL",
      interest: "BJJ",
      ageGroup: "ADULT",
      ...overrides,
    },
  });
}

export async function makeBotConfig(overrides: Record<string, unknown> = {}) {
  return prisma.botConfig.upsert({
    where: { id: "default" },
    create: { id: "default", ...overrides },
    update: overrides,
  });
}

/**
 * A two-step follow-up sequence a lead can be enrolled in. Deliberately hand-built rather than
 * seeded from `prisma/seed.ts`, so a wording change to the real drip can't break these tests.
 */
export async function makeSequence(key: string) {
  return prisma.sequence.create({
    data: {
      key,
      name: `${key} (test)`,
      steps: {
        create: [
          { order: 1, delayMinutes: 0, template: "Hi {{firstName}} — free class this week?" },
          { order: 2, delayMinutes: 60, template: "Still keen, {{firstName}}?" },
        ],
      },
    },
  });
}

/**
 * A scheduled class the agent is allowed to offer, with the program/template rows it needs.
 * `startsAt` defaults to a week out so it is unambiguously in the future.
 */
export async function makeSession(
  options: { startsAt?: Date; programName?: string; ageGroup?: string; status?: string } = {},
) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const program = await prisma.program.create({
    data: { name: options.programName ?? `BJJ ${suffix}`, description: "test" },
  });
  const template = await prisma.classTemplate.create({
    data: {
      name: `No Gi BJJ ${suffix}`,
      description: "test",
      programId: program.id,
      ageGroup: options.ageGroup ?? "ADULTS",
    },
  });
  return prisma.classSession.create({
    data: {
      templateId: template.id,
      startsAt: options.startsAt ?? new Date(Date.now() + 7 * 24 * 60 * 60_000),
      instructor: "Coach Test",
      status: options.status ?? "SCHEDULED",
    },
  });
}

/**
 * A moment automation is allowed to send at. Tests that assert delivery must not be at the mercy
 * of the wall clock: at 3am local, every automated send is correctly deferred instead.
 */
export async function sendableNow(from = new Date()) {
  const config = await prisma.botConfig.findUnique({ where: { id: "default" } });
  return nextSendableTime(from, config ?? { timezone: "America/Chicago", quietHoursStart: 21, quietHoursEnd: 8 });
}

/** The inverse: a moment inside quiet hours, for the deferral tests. */
export function quietMoment(config: { timezone: string; quietHoursStart: number; quietHoursEnd: number }) {
  const candidate = new Date();
  for (let i = 0; i < 48; i += 1) {
    const hour = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: config.timezone, hour: "numeric", hour12: false }).format(candidate),
    ) % 24;
    const { quietHoursStart: start, quietHoursEnd: end } = config;
    const quiet = start > end ? hour >= start || hour < end : hour >= start && hour < end;
    if (quiet) return candidate;
    candidate.setUTCHours(candidate.getUTCHours() + 1);
  }
  throw new Error("This configuration has no quiet hour");
}
