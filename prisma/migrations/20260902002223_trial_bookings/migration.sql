-- AlterTable
ALTER TABLE "LeadMessage" ADD COLUMN     "proposedSessionId" TEXT;

-- CreateTable
CREATE TABLE "TrialBooking" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "bookedBy" TEXT NOT NULL DEFAULT 'agent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "TrialBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrialBooking_leadId_sessionId_key" ON "TrialBooking"("leadId", "sessionId");

-- AddForeignKey
ALTER TABLE "TrialBooking" ADD CONSTRAINT "TrialBooking_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialBooking" ADD CONSTRAINT "TrialBooking_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
