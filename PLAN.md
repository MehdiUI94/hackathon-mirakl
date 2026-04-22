# Marketplace Growth Engine — Implementation Plan

> Source spec: prompt delivered 2026-04-21. Workbook: `marketplace_growth_engine_v3.xlsx` (to be dropped in project root).
> Target: `npm install && npm run seed && npm run dev` works end-to-end.

---

## Problem statement

A Mirakl / fashion-tech BD team manually manages outreach to 116+ brands across 7 marketplaces. The Excel workbook already encodes a weighted scoring model and 880 email templates but offers no live re-scoring, no pipeline tracking, and no enrichment path for new brands. This app productizes that workbook into a three-feature internal tool.

---

## Tech stack (locked)

| Layer | Choice |
|----|----|
| Framework | Next.js 15 (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui + Recharts |
| DB | SQLite via Prisma ORM + better-sqlite3 |
| Validation | Zod |
| i18n | next-intl (EN + FR locales) |
| Testing | Vitest (unit) + Playwright (e2e) |
| Workbook parser | xlsx (SheetJS) |
| Enrichment LLM | Anthropic Claude (pluggable via ANTHROPIC_API_KEY) |
| Search fallback | Brave / SerpAPI / Tavily (pluggable via env var) |
| Automation | n8n (external; wired via webhook) |

No auth in v1. Structured for easy auth layer addition (middleware stub).

---

## Data model (Prisma schema)

```prisma
model Brand {
  id                   String        @id @default(cuid())
  name                 String
  url                  String?
  country              String?
  category             String?
  productTags          String        @default("[]") // JSON array
  revenueMUsd          Float?
  headcount            Int?
  intlPresence         String?       // Low | Medium | High
  sustainable          Boolean       @default(false)
  positioning          String?
  existingMarketplaces String        @default("[]") // JSON array
  notes                String?
  sources              String?
  createdVia           String        @default("WORKBOOK") // WORKBOOK | MANUAL | ENRICHED
  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt
  scoringLines         ScoringLine[]
  recommendations      Recommendation[]
  campaignTargets      CampaignTarget[]
}

model Marketplace {
  id                  String        @id @default(cuid())
  name                String        @unique
  role                String?
  targetCategories    String        @default("[]")
  winningGeos         String        @default("[]")
  readinessThreshold  Float?
  gtmNotes            String?
  risks               String?
  sources             String?
  scoringLines        ScoringLine[]
  recommendations     Recommendation[]
  campaignTargets     CampaignTarget[]
}

model ScoringLine {
  id                  String      @id @default(cuid())
  brandId             String
  marketplaceId       String
  fitCategory         Float       @default(0)
  fitGeo              Float       @default(0)
  commercialScale     Float       @default(0)
  opsReadiness        Float       @default(0)
  fitPositioning      Float       @default(0)
  incrementality      Float       @default(0)
  sustainabilityStory Float       @default(0)
  baseCompletion      Float       @default(0)
  penalty             Float       @default(0)
  initialPrior        Float       @default(0)
  rawModelScore       Float       @default(0)
  finalScore          Float       @default(0)
  priority            String?
  alreadyPresent      Boolean     @default(false)
  dataNotes           String?
  brand               Brand       @relation(fields: [brandId], references: [id])
  marketplace         Marketplace @relation(fields: [marketplaceId], references: [id])
  @@unique([brandId, marketplaceId])
}

model Recommendation {
  id            String      @id @default(cuid())
  brandId       String
  rank          Int         // 1 or 2
  marketplaceId String
  score         Float
  priority      String?
  whyText       String?
  entryPlan     String?
  risks         String?
  confidence    String?
  brand         Brand       @relation(fields: [brandId], references: [id])
  marketplace   Marketplace @relation(fields: [marketplaceId], references: [id])
  @@unique([brandId, rank])
}

model CampaignTarget {
  id                  String          @id @default(cuid())
  brandId             String
  marketplaceId       String
  campaign            String          // C1 | C2
  topScore            Float?
  priority            String?
  backupMarketplaceId String?
  contactRole         String?
  emailAngle          String?
  campaignNote        String?
  sourceUrls          String          @default("[]")
  paused              Boolean         @default(false)
  stopped             Boolean         @default(false)
  brand               Brand           @relation(fields: [brandId], references: [id])
  marketplace         Marketplace     @relation(fields: [marketplaceId], references: [id])
  emailTemplates      EmailTemplate[]
  @@unique([brandId, marketplaceId, campaign])
}

model EmailTemplate {
  id               String         @id @default(cuid())
  campaignTargetId String
  step             Int
  delayDays        Int            @default(0)
  touchpoint       String?
  branch           String?        // Launch | Accelerate | null
  subject          String
  bodyText         String
  cta              String?
  stopRule         String?
  claimSources     String         @default("[]")
  status           String         @default("ACTIVE")
  campaignTarget   CampaignTarget @relation(fields: [campaignTargetId], references: [id])
  emailSends       EmailSend[]
}

model EmailSend {
  id               String        @id @default(cuid())
  emailTemplateId  String
  toEmail          String
  toFirstName      String?
  renderedSubject  String
  renderedBody     String
  sentAt           DateTime?
  n8nExecutionId   String?
  status           String        @default("DRAFT")
  // DRAFT | QUEUED | SENT | OPENED | REPLIED | BOUNCED | FAILED | STOPPED
  replyAt          DateTime?
  replyType        String?
  meetingBooked    Boolean       @default(false)
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
  emailTemplate    EmailTemplate @relation(fields: [emailTemplateId], references: [id])
}

model Campaign {
  id                     String   @id @default(cuid())
  name                   String
  startedAt              DateTime @default(now())
  defaultSenderFirstName String?
  defaultSenderEmail     String?
  webhookUrl             String?
}

model ScoringWeights {
  id              String  @id @default(cuid())
  profileName     String  @unique
  wCategory       Int     @default(30)
  wGeo            Int     @default(12)
  wScale          Int     @default(15)
  wOps            Int     @default(13)
  wPositioning    Int     @default(12)
  wIncrementality Int     @default(8)
  wStory          Int     @default(5)
  wPenalty        Int     @default(0)  // placeholder; penalties are not re-weighted
  wPrior          Float   @default(10) // percentage 0-30
  isDefault       Boolean @default(false)
}

model AppSettings {
  id                  String  @id @default("singleton")
  n8nWebhookUrl       String?
  n8nWebhookSecret    String?
  defaultSenderName   String?
  defaultSenderEmail  String?
  llmProvider         String? // anthropic | openai | ...
  llmApiKey           String?
  searchProvider      String? // brave | serpapi | tavily
  searchApiKey        String?
  defaultScoringProfile String?
}
```

### 4 preset ScoringWeights (seeded)

| Profile | Cat | Geo | Scale | Ops | Pos | Incr | Story | Prior |
|---|---|---|---|---|---|---|---|---|
| Balanced (default) | 30 | 12 | 15 | 13 | 12 | 8 | 5 | 10% |
| Category-first | 45 | 8 | 10 | 10 | 12 | 10 | 5 | 5% |
| Geo expansion | 22 | 28 | 12 | 13 | 10 | 10 | 5 | 5% |
| Ops-ready scale | 25 | 10 | 22 | 20 | 10 | 8 | 5 | 5% |

---

## Implementation phases

### Phase 0 — Project scaffold + seed pipeline (pre-req for everything)

**Tasks:**
- [ ] `npx create-next-app@latest` with App Router, TypeScript, Tailwind
- [ ] Add shadcn/ui, Recharts, Zod, next-intl, Prisma, better-sqlite3, xlsx, node-cron, cheerio
- [ ] Write `prisma/schema.prisma` (model above)
- [ ] Write `scripts/seed.ts` — parse workbook with correct header offsets:
  - `Data_Normalisee` row 2, `Scoring_Detail` row 3, `Reco_2_best` row 3, `Top_Pipeline` row 3
  - `Marketplace_Playbook` row 3, `Modele_Weights` row 3
  - `10_FR20_Universe` row 4, `11_FR20_Scoring` row 3, `12_FR20_Top2` row 3
  - `13_Camp1_Targets` row 3, `14_Camp1_Emails` row 3
  - `15_Camp2_Targets` row 3, `16_Camp2_Emails` row 3
  - `17_Campaign_Flows` row 3, `18_n8n_Model` row 3
  - Print column names + row counts for each sheet (smoke-test output)
- [ ] Seed 4 ScoringWeights presets + `AppSettings` singleton row
- [ ] `npm run seed` idempotent (upsert, not crash on re-run)
- [ ] Write `lib/scoring.ts` — rule-based scorer mirroring `Modele_Weights` logic
- [ ] EN + FR i18n message files scaffolded

**Acceptance:** `npm run seed` runs against the workbook with zero errors; SQLite DB has 116 brands, 7 marketplaces, 696 scoring lines, 232 recommendations.

---

### Phase 1 — Feature 1: Brand search + strategic re-scoring + email preview + n8n push

**Tasks:**
- [ ] `/brands` search page — free text + filter chips (country, category, positioning, priority, marketplace)
- [ ] Brand detail page `/brands/[id]`:
  - Header cards (name, URL, country flag, category/positioning badges, CA/headcount/intl, existing marketplace chips)
  - Strategy selector (4 presets + Custom with 8 sliders)
  - "Save as profile" → POST `/api/scoring-weights`
  - Scoring table (7 marketplace rows × 11 columns, final score recomputes client-side < 100ms)
  - Delta chip vs Balanced baseline
  - Top-2 recommendation cards (logo, score, priority, Why bullets, entry plan, risks)
  - "Already present" collapsed section
- [ ] Email preview modal:
  - Template fetched from `EmailTemplate` by `(campaignTargetId, step)`
  - Token highlighting ({{first_name}}, {{email}}, {{sender.first_name}})
  - Editable subject + body (textarea + markdown toggle)
  - Right pane: metadata, claim sources, source URLs
  - "To" inputs (required), "Send via n8n" button (disabled + tooltip if no webhook configured), "Save draft"
- [ ] `POST /api/send-email` — Zod-validates payload, POSTs to n8n, creates EmailSend row (status=QUEUED), returns n8nExecutionId
- [ ] Settings page `/settings` — reads/writes `AppSettings` singleton

**Acceptance:** Score recompute < 100ms client-side. Disabled send when no webhook. Already-present excluded from ranking. Edits to email body are what get posted (not raw template).

---

### Phase 2 — Feature 3: Email campaign tracking dashboard

**Tasks:**
- [ ] `/campaigns` dashboard:
  - KPI strip (8 cards, filterable by campaign / marketplace / priority / date range)
  - Charts: stacked bar (step × status), line (sends/day 30d), funnel (Sent→Opened→Replied→Meeting)
  - Per-brand pipeline table (one row per brand×marketplace×campaign, all columns + actions)
  - Per-email detail drawer (event timeline, rendered email, webhook payload, n8n execution link)
- [ ] `POST /api/webhooks/n8n` — validate X-Webhook-Secret header, update EmailSend row, apply stop rules
- [ ] Stop rule engine via node-cron (every 5 min): advance sequence if delayDays elapsed + no stop condition
- [ ] Pause / resume / stop actions from UI
- [ ] CSV export of campaign (same columns as xlsx sheets 14 + 16)

**Acceptance:** KPIs update within 2s of webhook. Stop from UI writes STOPPED and blocks cron. Reply rate = replied/sent (documented). CSV export works.

---

### Phase 3 — Feature 2: Add new brand via name or URL

**Tasks:**
- [ ] `/brands/new` form (name OR URL, at least one required)
- [ ] Server Action `enrichBrand`:
  1. Normalize (extract brand name from title/og; resolve URL from name via search)
  2. Scrape brand site (fetch + cheerio, robots.txt respected): meta, og, about, stockists, press → country, category, sustainability, intl presence, existing marketplaces
  3. Web search fallback via pluggable `searchProvider` (Brave/SerpAPI/Tavily or skip)
  4. LLM structuring via pluggable `llmProvider` (Anthropic or skip) — strict Zod schema, null-on-unsure, cite source URLs
  5. Score new brand against 7 marketplaces via `lib/scoring.ts` → persist 7 ScoringLines + top-2 Recommendations
  6. Stream progress to UI via Server-Sent Events
- [ ] Review screen: every enriched field + source URL + confidence pill + editable input
- [ ] Save: write Brand row (createdVia=ENRICHED or MANUAL), redirect to brand detail

**Acceptance:** Pipeline < 30s (scrape + search parallelized). Every field shows source URL or "Manual". Category < 70% confidence forces dropdown. New brand immediately searchable in Feature 1.

---

### Phase 4 — Home page KPI overview

- [ ] `/` page: top-line workbook KPIs (116 brands, 232 pairs, P1/P2/P3 distribution, avg score per marketplace)
- [ ] Hero card per marketplace (total recos, avg score, P1 count, link to brands filtered by that marketplace)
- [ ] Live campaign KPIs (from EmailSend)

---

### Phase 5 — Tests + docs

- [ ] Vitest unit tests: `lib/scoring.ts` (re-score known brand under Balanced → assert top-2 matches Reco_2_best), webhook receiver, enrichment Zod schemas
- [ ] Playwright e2e: happy path for each of the 3 features
- [ ] `README.md`: setup, re-seed, n8n wiring guide (payloads both directions), how to add a marketplace
- [ ] `DECISIONS.md`: log of key architecture choices
- [ ] `DEMO.md`: Loom-style walkthrough with screenshots
- [ ] `sample-n8n-workflow.json`: minimal n8n flow (receive webhook → send via Gmail → post email.sent / email.replied back)

---

## Cross-cutting rules

- **No mock data in production code paths.** Missing API key = loud fail in Settings or graceful skip with empty fields.
- **French labels are DB source of truth** ("P1 — Fort potentiel", "Catégorie optimisée"). i18n layer translates for UI.
- **Auth-ready structure**: middleware.ts stub, all routes assume future session check.
- **Score formula**: `final_score = 0.90 × (Σ components + baseCompletion − penalty) + 0.10 × initialPrior`
- **Re-ranking tie-break**: tied final score → higher initialPrior → alphabetical marketplace name.

---

## Pre-conditions (BLOCKERS before Phase 0)

1. `marketplace_growth_engine_v3.xlsx` must be present at project root before `npm run seed`.
2. Node.js 20+ and npm installed.
3. Optional: `ANTHROPIC_API_KEY`, `SEARCH_API_KEY`, `SEARCH_PROVIDER` env vars for Feature 2 enrichment.

---

## NOT in scope (v1)

- Authentication / multi-user
- Real-time collaborative editing
- Direct email sending from the app (n8n handles delivery)
- Mobile-optimized UI (internal desktop tool)
- Paid tier / billing

---

## Open decisions (to log in DECISIONS.md after build)

1. SQLite concurrency: next-intl + Prisma on SQLite = fine for single-user; document if multi-user is needed later.
2. Token rendering: highlight `{{tokens}}` with a yellow span in the email preview. Tokens are not interpolated until n8n processes them.
3. `lib/scoring.ts` rule-based scorer: component sub-scores are taken directly from `ScoringLine` rows seeded from the workbook. Re-weighting only changes the weighted sum — sub-scores are frozen.
4. `AppSettings` uses a singleton row pattern (id = "singleton") so no migration needed to add settings.
5. Cron in `npm run dev` uses node-cron inside a Next.js route handler (custom server pattern) to avoid needing a separate process.

---

## GSTACK REVIEW REPORT

| Reviewer | Runs | Status | Findings |
|---|---|---|---|
| CEO Review | 0 | NO REVIEWS YET | — |
| Codex Review | 0 | NO REVIEWS YET | — |
| Eng Review | 0 | NO REVIEWS YET | — |
| Design Review | 0 | NO REVIEWS YET | — |
| DX Review | 0 | NO REVIEWS YET | — |
