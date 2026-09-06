-- CreateTable
CREATE TABLE "PrivateSession" (
    "id" TEXT NOT NULL,
    "heldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL DEFAULT '',
    "photoType" TEXT NOT NULL DEFAULT '',
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "profileId" TEXT NOT NULL,

    CONSTRAINT "PrivateSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrivateSession_profileId_heldAt_idx" ON "PrivateSession"("profileId", "heldAt");

-- AddForeignKey
ALTER TABLE "PrivateSession" ADD CONSTRAINT "PrivateSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MemberProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
