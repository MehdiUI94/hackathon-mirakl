-- CreateTable
CREATE TABLE "EmailDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT,
    "marketplaceId" TEXT,
    "brandName" TEXT NOT NULL,
    "marketplaceName" TEXT NOT NULL,
    "campaign" TEXT,
    "step" INTEGER NOT NULL DEFAULT 1,
    "branch" TEXT,
    "toEmail" TEXT NOT NULL,
    "toFirstName" TEXT,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "cta" TEXT,
    "stopRule" TEXT,
    "claimSources" TEXT NOT NULL DEFAULT '[]',
    "meta" TEXT NOT NULL DEFAULT '{}',
    "callbackUrl" TEXT,
    "n8nExecutionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    "sentAt" DATETIME,
    "errorMessage" TEXT,
    CONSTRAINT "EmailDraft_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EmailDraft_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EmailDraft_status_idx" ON "EmailDraft"("status");

-- CreateIndex
CREATE INDEX "EmailDraft_campaign_idx" ON "EmailDraft"("campaign");
