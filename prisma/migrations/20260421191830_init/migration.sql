-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "country" TEXT,
    "category" TEXT,
    "productTags" TEXT NOT NULL DEFAULT '[]',
    "revenueMUsd" REAL,
    "headcount" INTEGER,
    "intlPresence" TEXT,
    "sustainable" BOOLEAN NOT NULL DEFAULT false,
    "positioning" TEXT,
    "existingMarketplaces" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "sources" TEXT,
    "createdVia" TEXT NOT NULL DEFAULT 'WORKBOOK',
    "sourceGroup" TEXT NOT NULL DEFAULT 'MAIN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Marketplace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "targetCategories" TEXT NOT NULL DEFAULT '[]',
    "winningGeos" TEXT NOT NULL DEFAULT '[]',
    "readinessThreshold" REAL,
    "gtmNotes" TEXT,
    "risks" TEXT,
    "sources" TEXT
);

-- CreateTable
CREATE TABLE "ScoringLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "marketplaceId" TEXT NOT NULL,
    "fitCategory" REAL NOT NULL DEFAULT 0,
    "fitGeo" REAL NOT NULL DEFAULT 0,
    "commercialScale" REAL NOT NULL DEFAULT 0,
    "opsReadiness" REAL NOT NULL DEFAULT 0,
    "fitPositioning" REAL NOT NULL DEFAULT 0,
    "incrementality" REAL NOT NULL DEFAULT 0,
    "sustainabilityStory" REAL NOT NULL DEFAULT 0,
    "baseCompletion" REAL NOT NULL DEFAULT 5,
    "penalty" REAL NOT NULL DEFAULT 0,
    "initialPrior" REAL NOT NULL DEFAULT 0,
    "rawModelScore" REAL NOT NULL DEFAULT 0,
    "finalScore" REAL NOT NULL DEFAULT 0,
    "priority" TEXT,
    "alreadyPresent" BOOLEAN NOT NULL DEFAULT false,
    "dataNotes" TEXT,
    CONSTRAINT "ScoringLine_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScoringLine_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "marketplaceId" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "priority" TEXT,
    "whyText" TEXT,
    "entryPlan" TEXT,
    "risks" TEXT,
    "confidence" TEXT,
    CONSTRAINT "Recommendation_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recommendation_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "marketplaceId" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "topScore" REAL,
    "priority" TEXT,
    "backupMarketplaceId" TEXT,
    "contactRole" TEXT,
    "emailAngle" TEXT,
    "campaignNote" TEXT,
    "sourceUrls" TEXT NOT NULL DEFAULT '[]',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "stopped" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CampaignTarget_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CampaignTarget_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignTargetId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "touchpoint" TEXT,
    "branch" TEXT,
    "subject" TEXT NOT NULL DEFAULT '',
    "bodyText" TEXT NOT NULL DEFAULT '',
    "cta" TEXT,
    "stopRule" TEXT,
    "claimSources" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "EmailTemplate_campaignTargetId_fkey" FOREIGN KEY ("campaignTargetId") REFERENCES "CampaignTarget" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailSend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailTemplateId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "toFirstName" TEXT,
    "renderedSubject" TEXT NOT NULL,
    "renderedBody" TEXT NOT NULL,
    "sentAt" DATETIME,
    "n8nExecutionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "replyAt" DATETIME,
    "replyType" TEXT,
    "meetingBooked" BOOLEAN NOT NULL DEFAULT false,
    "webhookPayload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailSend_emailTemplateId_fkey" FOREIGN KEY ("emailTemplateId") REFERENCES "EmailTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "defaultSenderFirstName" TEXT,
    "defaultSenderEmail" TEXT,
    "webhookUrl" TEXT
);

-- CreateTable
CREATE TABLE "ScoringWeights" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileName" TEXT NOT NULL,
    "wCategory" INTEGER NOT NULL DEFAULT 30,
    "wGeo" INTEGER NOT NULL DEFAULT 12,
    "wScale" INTEGER NOT NULL DEFAULT 15,
    "wOps" INTEGER NOT NULL DEFAULT 13,
    "wPositioning" INTEGER NOT NULL DEFAULT 12,
    "wIncrementality" INTEGER NOT NULL DEFAULT 8,
    "wStory" INTEGER NOT NULL DEFAULT 5,
    "wPenalty" INTEGER NOT NULL DEFAULT 0,
    "wPrior" REAL NOT NULL DEFAULT 10,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "n8nWebhookUrl" TEXT,
    "n8nWebhookSecret" TEXT,
    "defaultSenderName" TEXT,
    "defaultSenderEmail" TEXT,
    "llmProvider" TEXT,
    "llmApiKey" TEXT,
    "searchProvider" TEXT,
    "searchApiKey" TEXT,
    "defaultScoringProfile" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Marketplace_name_key" ON "Marketplace"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringLine_brandId_marketplaceId_key" ON "ScoringLine"("brandId", "marketplaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_brandId_rank_key" ON "Recommendation"("brandId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignTarget_brandId_marketplaceId_campaign_key" ON "CampaignTarget"("brandId", "marketplaceId", "campaign");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_campaignTargetId_step_branch_key" ON "EmailTemplate"("campaignTargetId", "step", "branch");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_name_key" ON "Campaign"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringWeights_profileName_key" ON "ScoringWeights"("profileName");
