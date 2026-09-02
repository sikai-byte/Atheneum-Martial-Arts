-- AlterTable
ALTER TABLE "BotConfig" ADD COLUMN     "coachAlertHours" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "coachAlertPhone" TEXT NOT NULL DEFAULT '';
