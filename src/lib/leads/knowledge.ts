import type { KnowledgeItem, Lead } from "@prisma/client";
import { prisma } from "../db";
import { SEED_KNOWLEDGE } from "./knowledgeSeed";

export const KNOWLEDGE_CATEGORIES = [
  "PROGRAM",
  "PRICING",
  "SCHEDULE",
  "POLICY",
  "OBJECTION",
  "UPSELL",
  "FAQ",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export const KNOWLEDGE_AUDIENCES = ["ALL", "KIDS", "ADULTS"] as const;

export async function seedKnowledge() {
  for (const item of SEED_KNOWLEDGE) {
    const existing = await prisma.knowledgeItem.findFirst({ where: { title: item.title } });
    if (existing) continue;
    await prisma.knowledgeItem.create({ data: item });
  }
}

/** Knowledge the agent may use for this lead: everything general plus their audience. */
export async function knowledgeForLead(lead: Pick<Lead, "ageGroup">) {
  const audience = lead.ageGroup === "KID" ? "KIDS" : lead.ageGroup === "ADULT" ? "ADULTS" : null;
  return prisma.knowledgeItem.findMany({
    where: {
      active: true,
      ...(audience ? { audience: { in: ["ALL", audience] } } : {}),
    },
    orderBy: [{ order: "asc" }, { title: "asc" }],
  });
}

export function renderKnowledge(items: KnowledgeItem[]): string {
  return items
    .filter((item) => item.verified)
    .map((item) => `[${item.category}] ${item.title}: ${item.body}`)
    .join("\n");
}

/** Titles staff still need to fill in — surfaced in the UI and withheld from the agent. */
export function unverifiedTitles(items: KnowledgeItem[]): string[] {
  return items.filter((item) => !item.verified).map((item) => item.title);
}
