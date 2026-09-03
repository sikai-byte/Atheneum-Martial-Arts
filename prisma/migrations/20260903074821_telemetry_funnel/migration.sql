-- AlterTable
ALTER TABLE "LeadMessage" ADD COLUMN     "staffEdited" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TrialBooking" ADD COLUMN     "attendanceAt" TIMESTAMP(3),
ADD COLUMN     "attendanceBy" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "AdSpend" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "campaign" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdSpend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffTouch" (
    "id" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'VIEW',
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadId" TEXT NOT NULL,

    CONSTRAINT "StaffTouch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "capturedOn" TEXT NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 30,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdSpend_source_periodStart_idx" ON "AdSpend"("source", "periodStart");

-- CreateIndex
CREATE INDEX "StaffTouch_leadId_createdAt_idx" ON "StaffTouch"("leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetricSnapshot_capturedOn_key" ON "MetricSnapshot"("capturedOn");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- AddForeignKey
ALTER TABLE "StaffTouch" ADD CONSTRAINT "StaffTouch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
