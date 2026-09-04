-- AlterTable
ALTER TABLE "MemberProfile" ADD COLUMN     "pinHash" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "WaiverSignature" (
    "id" TEXT NOT NULL,
    "signedName" TEXT NOT NULL,
    "guardianName" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'KIOSK',
    "version" INTEGER NOT NULL DEFAULT 1,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "profileId" TEXT NOT NULL,

    CONSTRAINT "WaiverSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaiverSignature_profileId_key" ON "WaiverSignature"("profileId");

-- AddForeignKey
ALTER TABLE "WaiverSignature" ADD CONSTRAINT "WaiverSignature_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MemberProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
