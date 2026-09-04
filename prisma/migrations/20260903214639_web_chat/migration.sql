-- AlterTable
ALTER TABLE "BotConfig" ADD COLUMN     "webChatDailyCap" INTEGER NOT NULL DEFAULT 400,
ADD COLUMN     "webChatEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "webChatGreeting" TEXT NOT NULL DEFAULT 'Hi! I''m the front desk at Atheneum Martial Arts. Ask me anything about our classes for kids or adults — or I can get you into a free trial class.',
ADD COLUMN     "webChatMaxTurns" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "WebChat" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "visitorName" TEXT NOT NULL DEFAULT '',
    "interest" TEXT NOT NULL DEFAULT '',
    "ageGroup" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "pageUrl" TEXT NOT NULL DEFAULT '',
    "referrer" TEXT NOT NULL DEFAULT '',
    "ipHash" TEXT NOT NULL DEFAULT '',
    "consentAt" TIMESTAMP(3),
    "consentText" TEXT NOT NULL DEFAULT '',
    "handoffAt" TIMESTAMP(3),
    "handoffReason" TEXT NOT NULL DEFAULT '',
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "leadId" TEXT,

    CONSTRAINT "WebChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebChatMessage" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'ANSWER',
    "generatedBy" TEXT NOT NULL DEFAULT 'RULES',
    "model" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chatId" TEXT NOT NULL,

    CONSTRAINT "WebChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebChat_status_createdAt_idx" ON "WebChat"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WebChat_leadId_idx" ON "WebChat"("leadId");

-- CreateIndex
CREATE INDEX "WebChatMessage_chatId_createdAt_idx" ON "WebChatMessage"("chatId", "createdAt");

-- AddForeignKey
ALTER TABLE "WebChat" ADD CONSTRAINT "WebChat_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebChatMessage" ADD CONSTRAINT "WebChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "WebChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
