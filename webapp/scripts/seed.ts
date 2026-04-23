#!/usr/bin/env tsx
/**
 * Seed script — parses marketplace_growth_engine_v3.xlsx and populates the SQLite DB.
 * Run: npm run seed
 *
 * Header row offsets (0-indexed, verified against actual workbook):
 *   Data_Normalisee    row 3
 *   Scoring_Detail     row 3
 *   Reco_2_best        row 3
 *   Marketplace_Playbook row 3
 *   FR30_Universe      row 3
 *   FR30_Scoring       row 3
 *   FR30_Top2          row 3
 *   13_Camp1_Targets   row 3
 *   14_Camp1_Emails    row 3
 *   15_Camp2_Targets   row 3
 *   16_Camp2_Emails    row 3
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import * as XLSX from "xlsx";
import path from "node:path";
import { PrismaClient } from "../app/generated/prisma/client";

// ─── Setup DB ────────────────────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required. Use a PostgreSQL connection string.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalize(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s).normalize("NFC").trim();
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(",", ".").replace(/\s/g, ""));
  return isNaN(n) ? null : n;
}

function bool(v: unknown): boolean {
  if (!v) return false;
  const s = String(v).toLowerCase().trim();
  return s === "oui" || s === "yes" || s === "true" || s === "1" || s === "x";
}

function jsonArr(v: unknown): string {
  if (!v || v === "") return "[]";
  const s = normalize(v);
  if (s.startsWith("[")) return s;
  return JSON.stringify(
    s
      .split(/[,;|]+/)
      .map((x) => x.trim())
      .filter(Boolean)
  );
}

/**
 * Read a sheet, skip `headerRow` rows, treat that row as column names.
 * Returns array of row-objects keyed by column headers.
 */
function readSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  headerRow: number
): Record<string, unknown>[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    console.warn(`  ⚠  Sheet not found: "${sheetName}"`);
    return [];
  }
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
  }) as unknown[][];

  if (raw.length <= headerRow) {
    console.warn(`  ⚠  Sheet "${sheetName}" has fewer rows than expected`);
    return [];
  }

  const headers = (raw[headerRow] as unknown[]).map((h) => normalize(h));
  const rows: Record<string, unknown>[] = [];

  for (let i = headerRow + 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    if (row.every((c) => c === "" || c === null || c === undefined)) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? "";
    });
    rows.push(obj);
  }

  console.log(
    `  ✓ ${sheetName.padEnd(26)} | ${String(rows.length).padStart(4)} data rows | headers: ${headers.filter(Boolean).slice(0, 6).join(", ")}${headers.filter(Boolean).length > 6 ? " …" : ""}`
  );
  return rows;
}

/** Find a value by trying multiple possible column name variants. */
function col(row: Record<string, unknown>, ...candidates: string[]): unknown {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== "") return row[c];
    const lower = c.toLowerCase();
    for (const k of Object.keys(row)) {
      if (k.toLowerCase() === lower && row[k] !== "") return row[k];
    }
  }
  return "";
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const workbookPath = path.resolve(
    process.cwd(),
    "..",
    "marketplace_growth_engine_v3.xlsx"
  );

  console.log(`\nLoading workbook: ${workbookPath}`);

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.readFile(workbookPath, { cellFormula: false, cellStyles: false });
  } catch {
    console.error(
      `\n❌ Cannot read workbook.\n   Drop marketplace_growth_engine_v3.xlsx in the parent directory (hackathon-mirakl/) then re-run.\n`
    );
    process.exit(1);
  }

  console.log(`\nSheets found: ${wb.SheetNames.join(", ")}\n`);
  console.log("Parsing sheets...\n");

  // ── 1. Parse all sheets ────────────────────────────────────────────────────

  const dataNormalisee    = readSheet(wb, "Data_Normalisee",    3);
  const scoringDetail     = readSheet(wb, "Scoring_Detail",     3);
  const reco2best         = readSheet(wb, "Reco_2_best",        3);
  const marketplacePlaybook = readSheet(wb, "Marketplace_Playbook", 3);
  const fr30Universe      = readSheet(wb, "FR30_Universe",      3);
  const fr30Scoring       = readSheet(wb, "FR30_Scoring",       3);
  const fr30Top2          = readSheet(wb, "FR30_Top2",          3);
  const camp1Targets      = readSheet(wb, "13_Camp1_Targets",   3);
  const camp1Emails       = readSheet(wb, "14_Camp1_Emails",    3);
  const camp2Targets      = readSheet(wb, "15_Camp2_Targets",   3);
  const camp2Emails       = readSheet(wb, "16_Camp2_Emails",    3);

  // ── 2. Seed Marketplaces ───────────────────────────────────────────────────

  console.log("\nSeeding Marketplaces…");
  const marketplaceIds: Record<string, string> = {};

  for (const row of marketplacePlaybook) {
    const name = normalize(col(row, "Marketplace"));
    if (!name) continue;

    const mp = await prisma.marketplace.upsert({
      where: { name },
      create: {
        name,
        role: normalize(col(row, "Rôle stratégique")) || undefined,
        targetCategories: jsonArr(col(row, "Catégories à prioriser")),
        winningGeos: jsonArr(col(row, "Géos gagnantes")),
        readinessThreshold: num(col(row, "Seuil de readiness")) ?? undefined,
        gtmNotes: normalize(col(row, "Go-to-market recommandé")) || undefined,
        risks: normalize(col(row, "Risque à cadrer")) || undefined,
        sources: normalize(col(row, "Sources")) || undefined,
      },
      update: {},
    });
    marketplaceIds[name] = mp.id;
    // store apostrophe variants
    if (name.includes("'")) {
      marketplaceIds[name.replace(/'/g, "'")] = mp.id;
      marketplaceIds[name.replace(/'/g, "'")] = mp.id;
    }
  }

  // Ensure the 7 canonical marketplaces exist even if Marketplace_Playbook is sparse
  const canonicalMarketplaces = [
    "Bloomingdale's",
    "Nordstrom",
    "Galeries Lafayette",
    "John Lewis",
    "La Redoute",
    "Debenhams",
    "Zalando",
  ];
  for (const name of canonicalMarketplaces) {
    if (!marketplaceIds[name]) {
      const mp = await prisma.marketplace.upsert({
        where: { name },
        create: { name },
        update: {},
      });
      marketplaceIds[name] = mp.id;
    }
  }
  console.log(`  ✓ ${Object.keys(marketplaceIds).length} marketplace records`);

  function mpId(name: string): string | null {
    const n = normalize(name);
    if (!n) return null;
    if (marketplaceIds[n]) return marketplaceIds[n];
    for (const [k, v] of Object.entries(marketplaceIds)) {
      if (
        k.toLowerCase().includes(n.toLowerCase()) ||
        n.toLowerCase().includes(k.toLowerCase())
      )
        return v;
    }
    return null;
  }

  // ── 3. Seed Brands (Data_Normalisee + FR30_Universe) ──────────────────────

  console.log("\nSeeding Brands…");
  const brandIds: Record<string, string> = {};

  async function upsertBrand(
    row: Record<string, unknown>,
    sourceGroup: string
  ): Promise<string | null> {
    const name = normalize(col(row, "Marque", "Brand", "Nom", "Name"));
    if (!name) return null;
    if (brandIds[name]) return brandIds[name];

    const existing = await prisma.brand.findFirst({ where: { name } });
    if (existing) {
      brandIds[name] = existing.id;
      return existing.id;
    }

    const url = normalize(col(row, "URL", "url", "Site", "Website"));
    const country = normalize(col(row, "Pays", "Country"));
    const category = normalize(
      col(row, "Catégorie optimisée", "Category Label", "Category Key", "Category", "Catégorie")
    );
    const productTags = jsonArr(col(row, "Tags produits", "Product Tags", "Tags"));
    const revenueMUsd =
      num(col(row, "CA utilisé ($M)", "CA estimé utilisé ($M)", "CA ($M)", "Revenue")) ?? undefined;
    const headcountRaw = num(col(row, "Effectif utilisé", "Effectif min utilisé", "Effectif", "Employees"));
    const headcount = headcountRaw != null ? Math.round(headcountRaw) : undefined;
    const intlPresence = normalize(col(row, "Intl.", "International", "Présence internationale"));
    const sustainable = bool(col(row, "Durable/éthique", "Durable / éthique", "Durable", "Sustainability"));
    const positioning = normalize(col(row, "Positionnement", "Positioning"));
    const existingMarketplaces = jsonArr(
      col(row, "Marketplaces déjà présents", "Current marketplace audit", "Existing Marketplaces")
    );
    const notes = normalize(col(row, "Notes data", "Notes"));
    const sources = normalize(col(row, "Sources marque", "Source URLs", "Sources"));

    const brand = await prisma.brand.create({
      data: {
        name,
        url: url || undefined,
        country: country || undefined,
        category: category || undefined,
        productTags,
        revenueMUsd,
        headcount,
        intlPresence: intlPresence || undefined,
        sustainable,
        positioning: positioning || undefined,
        existingMarketplaces,
        notes: notes || undefined,
        sources: sources || undefined,
        createdVia: "WORKBOOK",
        sourceGroup,
      },
    });

    brandIds[name] = brand.id;
    return brand.id;
  }

  for (const row of dataNormalisee) {
    await upsertBrand(row, "MAIN");
  }
  for (const row of fr30Universe) {
    await upsertBrand(row, "FR30");
  }
  console.log(`  ✓ ${Object.keys(brandIds).length} brand records`);

  // ── 4. Seed ScoringLines ───────────────────────────────────────────────────

  console.log("\nSeeding ScoringLines…");

  async function seedScoringLine(
    row: Record<string, unknown>,
    isFR30 = false
  ): Promise<void> {
    const brandName = normalize(col(row, "Marque", "Brand"));
    const mpName = normalize(col(row, "Marketplace"));
    if (!brandName || !mpName) return;

    const brandId = brandIds[brandName];
    const marketplaceId = mpId(mpName);
    if (!brandId || !marketplaceId) return;

    // Column names differ between Scoring_Detail (FR) and FR30_Scoring (EN)
    const fitCategory = num(
      col(row, "Fit catégorie", "Category Score")
    ) ?? 0;
    const fitGeo = num(
      col(row, "Fit géographique", "Geo Score")
    ) ?? 0;
    const commercialScale = num(
      col(row, "Échelle commerciale", "Scale Score")
    ) ?? 0;
    const opsReadiness = num(
      col(row, "Readiness ops/wholesale", "Ops Score")
    ) ?? 0;
    const fitPositioning = num(
      col(row, "Fit positionnement", "Position Score")
    ) ?? 0;
    const incrementality = num(
      col(row, "Incrémentalité", "Incrementality Score")
    ) ?? 0;
    const sustainabilityStory = num(
      col(row, "Story/durabilité", "Story Score")
    ) ?? 0;
    const penalty = num(
      col(row, "Pénalité risque", "Penalty")
    ) ?? 0;
    const rawModelScore = num(
      col(row, "Score modèle brut", "Raw Score")
    ) ?? 0;
    const finalScore = num(
      col(row, "Score optimisé", "Score")
    ) ?? 0;
    const initialPrior = num(
      col(row, "Score initial")
    ) ?? 0;
    const priority =
      normalize(col(row, "Priorité", "Priority")) || undefined;
    const alreadyPresent = bool(
      col(row, "Déjà présent ?", "Already Present")
    );
    const dataNotes =
      normalize(col(row, "Notes data", "Notes")) || undefined;

    await prisma.scoringLine.upsert({
      where: { brandId_marketplaceId: { brandId, marketplaceId } },
      create: {
        brandId,
        marketplaceId,
        fitCategory,
        fitGeo,
        commercialScale,
        opsReadiness,
        fitPositioning,
        incrementality,
        sustainabilityStory,
        penalty,
        initialPrior,
        rawModelScore,
        finalScore,
        priority,
        alreadyPresent,
        dataNotes,
      },
      update: {
        fitCategory,
        fitGeo,
        commercialScale,
        opsReadiness,
        fitPositioning,
        incrementality,
        sustainabilityStory,
        penalty,
        initialPrior,
        rawModelScore,
        finalScore,
        priority,
        alreadyPresent,
        dataNotes,
      },
    });
  }

  let scoringCount = 0;
  for (const row of scoringDetail) {
    await seedScoringLine(row);
    scoringCount++;
  }
  for (const row of fr30Scoring) {
    await seedScoringLine(row, true);
    scoringCount++;
  }
  console.log(`  ✓ ${scoringCount} scoring line input rows processed`);

  // ── 5. Seed Recommendations (Reco_2_best + FR30_Top2) ─────────────────────

  console.log("\nSeeding Recommendations…");

  async function seedReco(
    row: Record<string, unknown>,
    rank: 1 | 2
  ): Promise<void> {
    const brandName = normalize(col(row, "Marque", "Brand"));
    const mpKey = rank === 1 ? "Reco #1" : "Reco #2";
    const mpName = normalize(col(row, mpKey));
    if (!brandName || !mpName) return;

    const brandId = brandIds[brandName];
    const marketplaceId = mpId(mpName);
    if (!brandId || !marketplaceId) return;

    const scoreKey = rank === 1 ? "Score #1" : "Score #2";
    const priorityKey = rank === 1 ? "Priorité #1" : "Priorité #2";
    const whyKey = rank === 1 ? "Pourquoi #1" : "Pourquoi #2";
    const entryKey = rank === 1 ? "Plan d'entrée #1" : "Plan d'entrée #2";
    const risksKey =
      rank === 1 ? "Conditions / risques #1" : "Conditions / risques #2";

    await prisma.recommendation.upsert({
      where: { brandId_rank: { brandId, rank } },
      create: {
        brandId,
        rank,
        marketplaceId,
        score: num(col(row, scoreKey)) ?? 0,
        priority: normalize(col(row, priorityKey)) || undefined,
        whyText: normalize(col(row, whyKey)) || undefined,
        entryPlan: normalize(col(row, entryKey)) || undefined,
        risks: normalize(col(row, risksKey)) || undefined,
        confidence: normalize(col(row, "Confiance")) || undefined,
      },
      update: {
        marketplaceId,
        score: num(col(row, scoreKey)) ?? 0,
        priority: normalize(col(row, priorityKey)) || undefined,
      },
    });
  }

  for (const sheetRows of [reco2best, fr30Top2]) {
    for (const row of sheetRows) {
      await seedReco(row, 1).catch(() => {});
      await seedReco(row, 2).catch(() => {});
    }
  }

  const recoCount = await prisma.recommendation.count();
  console.log(`  ✓ ${recoCount} recommendation records`);

  // ── 6. Seed CampaignTargets + EmailTemplates ───────────────────────────────

  console.log("\nSeeding Campaign targets and email templates…");

  async function seedCampaign(
    targets: Record<string, unknown>[],
    emails: Record<string, unknown>[],
    campaign: "C1" | "C2"
  ): Promise<void> {
    // Build Lead ID → email rows index for fast lookup
    const emailsByLeadId: Record<string, Record<string, unknown>[]> = {};
    for (const e of emails) {
      const lid = normalize(col(e, "Lead ID"));
      if (!lid) continue;
      emailsByLeadId[lid] = emailsByLeadId[lid] ?? [];
      emailsByLeadId[lid].push(e);
    }

    for (const row of targets) {
      const brandName = normalize(col(row, "Brand", "Marque"));
      // Camp1 → "Top Marketplace", Camp2 → always Zalando
      const mpName =
        campaign === "C1"
          ? normalize(col(row, "Top Marketplace", "Marketplace"))
          : "Zalando";
      if (!brandName || !mpName) continue;

      const brandId = brandIds[brandName];
      const marketplaceId = mpId(mpName);
      if (!brandId || !marketplaceId) continue;

      const existing = await prisma.campaignTarget.findFirst({
        where: { brandId, marketplaceId, campaign },
      });

      const targetData = {
        brandId,
        marketplaceId,
        campaign,
        topScore:
          num(col(row, "Top Score", "Zalando Fit Score", "Score")) ?? undefined,
        priority: normalize(col(row, "Priority", "Priorité")) || undefined,
        backupMarketplaceId:
          mpId(normalize(col(row, "Backup Marketplace"))) ?? undefined,
        contactRole:
          normalize(col(row, "Contact Role", "Rôle contact")) || undefined,
        emailAngle:
          normalize(col(row, "Email Angle")) || undefined,
        campaignNote:
          normalize(col(row, "Campaign Note", "Note")) || undefined,
        sourceUrls: jsonArr(
          col(row, "Source URLs", "Official Channel Sources", "Sources")
        ),
      };

      const target = existing
        ? existing
        : await prisma.campaignTarget.create({ data: targetData });

      const leadId = normalize(col(row, "Lead ID"));
      const matchingEmails = leadId
        ? (emailsByLeadId[leadId] ?? [])
        : [];

      for (const emailRow of matchingEmails) {
        const step = Math.round(
          num(col(emailRow, "Step", "Étape")) ?? 1
        );
        const branch =
          normalize(col(emailRow, "Branch", "Branche")) || null;

        await prisma.emailTemplate
          .upsert({
            where: {
              campaignTargetId_step_branch: {
                campaignTargetId: target.id,
                step,
                branch: branch ?? "",
              },
            },
            create: {
              campaignTargetId: target.id,
              step,
              delayDays: Math.round(
                num(col(emailRow, "Delay Days", "Délai (j)")) ?? 0
              ),
              touchpoint:
                normalize(col(emailRow, "Touchpoint")) || undefined,
              branch: branch ?? undefined,
              subject: normalize(
                col(emailRow, "Subject", "Objet")
              ),
              bodyText: normalize(
                col(emailRow, "Body Text", "Corps", "Email body")
              ),
              cta: normalize(col(emailRow, "CTA")) || undefined,
              stopRule:
                normalize(col(emailRow, "Stop Rule", "Règle stop")) ||
                undefined,
              claimSources: jsonArr(
                col(emailRow, "Claim Sources", "Sources claim")
              ),
            },
            update: {
              subject: normalize(col(emailRow, "Subject", "Objet")),
              bodyText: normalize(
                col(emailRow, "Body Text", "Corps", "Email body")
              ),
            },
          })
          .catch(() => {});
      }
    }
  }

  await seedCampaign(camp1Targets, camp1Emails, "C1");
  await seedCampaign(camp2Targets, camp2Emails, "C2");

  const targetCount = await prisma.campaignTarget.count();
  const templateCount = await prisma.emailTemplate.count();
  console.log(
    `  ✓ ${targetCount} campaign targets, ${templateCount} email templates`
  );

  // ── 7. Seed ScoringWeights presets ────────────────────────────────────────

  console.log("\nSeeding ScoringWeights presets…");

  const presets = [
    {
      profileName: "Balanced",
      wCategory: 30, wGeo: 12, wScale: 15, wOps: 13, wPositioning: 12,
      wIncrementality: 8, wStory: 5, wPenalty: 0, wPrior: 10,
      isDefault: true, isSystem: true,
    },
    {
      profileName: "Category-first",
      wCategory: 45, wGeo: 8, wScale: 10, wOps: 10, wPositioning: 12,
      wIncrementality: 10, wStory: 5, wPenalty: 0, wPrior: 5,
      isDefault: false, isSystem: true,
    },
    {
      profileName: "Geo expansion",
      wCategory: 22, wGeo: 28, wScale: 12, wOps: 13, wPositioning: 10,
      wIncrementality: 10, wStory: 5, wPenalty: 0, wPrior: 5,
      isDefault: false, isSystem: true,
    },
    {
      profileName: "Ops-ready scale",
      wCategory: 25, wGeo: 10, wScale: 22, wOps: 20, wPositioning: 10,
      wIncrementality: 8, wStory: 5, wPenalty: 0, wPrior: 5,
      isDefault: false, isSystem: true,
    },
  ];

  for (const preset of presets) {
    await prisma.scoringWeights.upsert({
      where: { profileName: preset.profileName },
      create: preset,
      update: { isDefault: preset.isDefault },
    });
  }
  console.log(`  ✓ 4 scoring weight presets`);

  // ── 8. Seed AppSettings singleton ─────────────────────────────────────────

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });

  // ── 9. Seed Campaigns ──────────────────────────────────────────────────────

  for (const name of ["Campaign 1 — Main", "Campaign 2 — Amazon FR → Zalando"]) {
    await prisma.campaign.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }

  // ── 10. Final summary ──────────────────────────────────────────────────────

  const [brands, mps, scoringLines, recos, campTargets, emailTpls] =
    await Promise.all([
      prisma.brand.count(),
      prisma.marketplace.count(),
      prisma.scoringLine.count(),
      prisma.recommendation.count(),
      prisma.campaignTarget.count(),
      prisma.emailTemplate.count(),
    ]);

  console.log(`
╔══════════════════════════════════════╗
║          SEED COMPLETE               ║
╠══════════════════════════════════════╣
║  Brands             ${String(brands).padStart(6)}           ║
║  Marketplaces       ${String(mps).padStart(6)}           ║
║  Scoring lines      ${String(scoringLines).padStart(6)}           ║
║  Recommendations    ${String(recos).padStart(6)}           ║
║  Campaign targets   ${String(campTargets).padStart(6)}           ║
║  Email templates    ${String(emailTpls).padStart(6)}           ║
╚══════════════════════════════════════╝
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
