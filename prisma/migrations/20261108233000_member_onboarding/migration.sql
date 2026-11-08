-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canManageMembers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onboardingEmailSentAt" TIMESTAMP(3);
