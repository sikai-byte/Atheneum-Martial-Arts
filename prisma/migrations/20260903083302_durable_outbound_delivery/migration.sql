-- AlterTable
ALTER TABLE "LeadMessage" ADD COLUMN     "actor" TEXT NOT NULL DEFAULT 'AUTOMATION',
ADD COLUMN     "agentAuthored" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "LeadMessage_status_createdAt_idx" ON "LeadMessage"("status", "createdAt");
