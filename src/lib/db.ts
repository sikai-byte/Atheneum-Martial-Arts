import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// SQLite allows one writer at a time; a single pooled connection serializes
// queries client-side instead of surfacing SQLITE_BUSY under concurrency.
function databaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("file:")) return url;
  return url.includes("connection_limit") ? url : `${url}${url.includes("?") ? "&" : "?"}connection_limit=1`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ datasources: { db: { url: databaseUrl() } } });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
