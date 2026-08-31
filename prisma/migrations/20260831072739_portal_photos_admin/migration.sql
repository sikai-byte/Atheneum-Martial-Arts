-- AlterTable
ALTER TABLE "MemberProfile" ADD COLUMN     "photoType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "photoUpdatedAt" TIMESTAMP(3);
