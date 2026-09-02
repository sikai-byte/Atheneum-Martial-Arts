-- AlterTable
ALTER TABLE "BotConfig" ADD COLUMN     "agentEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "agentMode" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "agentPersona" TEXT NOT NULL DEFAULT 'You are Sam, the front-desk coach at the studio. Warm, direct, never pushy.';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "handoffAt" TIMESTAMP(3),
ADD COLUMN     "handoffReason" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "LeadMessage" ADD COLUMN     "agentAction" TEXT;

-- CreateTable
CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'FAQ',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "program" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeItem_category_active_idx" ON "KnowledgeItem"("category", "active");
