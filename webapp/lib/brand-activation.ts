import { prisma } from "@/lib/db";
import {
  BALANCED_WEIGHTS,
  parseStringArray,
  scoreBrandAgainstMarketplaces,
  type BrandLike,
  type ScoredLine,
  type ScoringWeightsInput,
} from "@/lib/scoring";

const AUTO_ACTIVATION_CAMPAIGN = "AUTO_ENRICHMENT";

export type BrandEnrichmentInput = {
  name?: string | null;
  url?: string | null;
  country?: string | null;
  category?: string | null;
  foundedYear?: number | null;
  headquartersAddress?: string | null;
  companyType?: string | null;
  businessSignals?: string[] | string | null;
  genderFocus?: string | null;
  productType?: string | null;
  productTags?: string[] | string | null;
  revenueMUsd?: number | null;
  headcount?: number | null;
  intlPresence?: string | null;
  sustainable?: boolean | null;
  positioning?: string | null;
  existingMarketplaces?: string[] | string | null;
  notes?: string | null;
  sources?: string | null;
  amazonSignal?: string | null;
  zalandoSignal?: string | null;
  contactEmail?: string | null;
  contactRole?: string | null;
  contactPersona?: string | null;
  contactSubjectHint?: string | null;
  createdVia?: string | null;
};

export type BrandPreviewScore = {
  marketplaceId: string;
  marketplaceName: string;
  score: number;
  priority: string;
  benchmarkScore: number | null;
  benchmarkMatchedBrands: number;
  benchmarkConfidence: "low" | "medium" | "high";
  components: ScoredLine["components"];
};

export async function computeBrandPreview(
  input: BrandEnrichmentInput,
  weights: ScoringWeightsInput = BALANCED_WEIGHTS,
  excludeBrandId?: string
) {
  const brand = normalizeBrandInput(input);
  const marketplaces = await prisma.marketplace.findMany();
  const benchmarkByMarketplace = await buildBenchmarkByMarketplace(brand, excludeBrandId);
  const lines = scoreBrandAgainstMarketplaces(brand, marketplaces, weights, benchmarkByMarketplace);

  const scores: BrandPreviewScore[] = lines
    .filter((line) => !line.alreadyPresent)
    .sort((a, b) => b.finalScore - a.finalScore)
    .map((line) => ({
      marketplaceId: line.marketplaceId,
      marketplaceName: line.marketplaceName,
      score: line.finalScore,
      priority: line.priority,
      benchmarkScore: line.benchmarkScore,
      benchmarkMatchedBrands: line.benchmarkMatchedBrands,
      benchmarkConfidence: line.benchmarkConfidence,
      components: line.components,
    }));

  return { brand, scores, scoredLines: lines };
}

export async function saveBrandWithActivation(input: BrandEnrichmentInput) {
  const existing = await findExistingBrand(input);
  const preview = await computeBrandPreview(input, BALANCED_WEIGHTS, existing?.id);

  const brandRecord = existing
    ? await prisma.brand.update({
        where: { id: existing.id },
        data: toBrandPersistenceData(preview.brand),
      })
    : await prisma.brand.create({
        data: toBrandPersistenceData(preview.brand),
      });

  await syncBrandDerivedArtifacts(brandRecord.id, preview.brand, preview.scoredLines);
  return { brand: brandRecord, scores: preview.scores };
}

function normalizeBrandInput(input: BrandEnrichmentInput): BrandEnrichmentInput {
  return {
    name: cleanString(input.name) ?? inferBrandNameFromUrl(input.url) ?? "Unnamed Brand",
    url: normalizeUrl(input.url),
    country: cleanString(input.country),
    category: cleanString(input.category),
    foundedYear: normalizeNumber(input.foundedYear),
    headquartersAddress: cleanString(input.headquartersAddress),
    companyType: cleanString(input.companyType),
    businessSignals: parseStringArray(input.businessSignals),
    genderFocus: cleanString(input.genderFocus),
    productType: cleanString(input.productType),
    productTags: parseStringArray(input.productTags),
    revenueMUsd: normalizeNumber(input.revenueMUsd),
    headcount: normalizeInteger(input.headcount),
    intlPresence: cleanString(input.intlPresence),
    sustainable: Boolean(input.sustainable),
    positioning: cleanString(input.positioning),
    existingMarketplaces: parseStringArray(input.existingMarketplaces),
    notes: cleanString(input.notes),
    sources: cleanString(input.sources) ?? normalizeUrl(input.url),
    amazonSignal: cleanString(input.amazonSignal),
    zalandoSignal: cleanString(input.zalandoSignal),
    contactEmail: cleanString(input.contactEmail),
    contactRole: cleanString(input.contactRole),
    contactPersona: cleanString(input.contactPersona),
    contactSubjectHint: cleanString(input.contactSubjectHint),
    createdVia: cleanString(input.createdVia) ?? "ENRICHED",
  };
}

async function buildBenchmarkByMarketplace(
  brand: BrandEnrichmentInput,
  excludeBrandId?: string
) {
  const filters = [brand.category, brand.positioning, brand.productType, brand.genderFocus]
    .map((value) => cleanString(value))
    .filter(Boolean) as string[];

  if (filters.length === 0) return {};

  const similarBrands = await prisma.brand.findMany({
    where: {
      AND: [
        excludeBrandId ? { id: { not: excludeBrandId } } : {},
        {
          OR: filters.flatMap((value) => [
            { category: { contains: value } },
            { positioning: { contains: value } },
            { productType: { contains: value } },
            { genderFocus: { contains: value } },
          ]),
        },
      ],
    },
    include: {
      scoringLines: {
        where: { alreadyPresent: false },
      },
    },
    take: 40,
  });

  const aggregates = new Map<string, { total: number; weight: number; brands: Set<string> }>();

  for (const similarBrand of similarBrands) {
    const similarity = getSimilarityScore(brand, similarBrand);
    if (similarity <= 0) continue;

    for (const line of similarBrand.scoringLines) {
      const current = aggregates.get(line.marketplaceId) ?? {
        total: 0,
        weight: 0,
        brands: new Set<string>(),
      };
      current.total += line.finalScore * similarity;
      current.weight += similarity;
      current.brands.add(similarBrand.id);
      aggregates.set(line.marketplaceId, current);
    }
  }

  return Object.fromEntries(
    Array.from(aggregates.entries())
      .filter(([, value]) => value.weight > 0)
      .map(([marketplaceId, value]) => [
        marketplaceId,
        {
          averageScore: Math.round((value.total / value.weight) * 10) / 10,
          matchedBrands: value.brands.size,
        },
      ])
  );
}

function getSimilarityScore(candidate: BrandEnrichmentInput, reference: BrandLike) {
  let score = 0;
  if (matchesLoose(candidate.category, reference.category)) score += 4;
  if (matchesLoose(candidate.positioning, reference.positioning)) score += 3;
  if (matchesLoose(candidate.productType, reference.productType)) score += 2;
  if (matchesLoose(candidate.genderFocus, reference.genderFocus)) score += 1.5;
  if (matchesLoose(candidate.country, reference.country)) score += 1;

  const candidateSignals = parseStringArray(candidate.businessSignals).map(normalizeToken);
  const referenceSignals = parseStringArray(reference.businessSignals).map(normalizeToken);
  if (candidateSignals.some((signal) => referenceSignals.includes(signal))) score += 1.5;

  return score;
}

async function syncBrandDerivedArtifacts(
  brandId: string,
  brand: BrandEnrichmentInput,
  scoredLines: ScoredLine[]
) {
  await prisma.$transaction(async (tx) => {
    for (const line of scoredLines) {
      await tx.scoringLine.upsert({
        where: { brandId_marketplaceId: { brandId, marketplaceId: line.marketplaceId } },
        create: {
          brandId,
          marketplaceId: line.marketplaceId,
          ...line.components,
          rawModelScore: line.finalScore,
          finalScore: line.finalScore,
          priority: line.priority,
          alreadyPresent: line.alreadyPresent,
          dataNotes: JSON.stringify({
            benchmarkScore: line.benchmarkScore,
            benchmarkMatchedBrands: line.benchmarkMatchedBrands,
            benchmarkConfidence: line.benchmarkConfidence,
          }),
        },
        update: {
          ...line.components,
          rawModelScore: line.finalScore,
          finalScore: line.finalScore,
          priority: line.priority,
          alreadyPresent: line.alreadyPresent,
          dataNotes: JSON.stringify({
            benchmarkScore: line.benchmarkScore,
            benchmarkMatchedBrands: line.benchmarkMatchedBrands,
            benchmarkConfidence: line.benchmarkConfidence,
          }),
        },
      });
    }

    await tx.recommendation.deleteMany({ where: { brandId } });

    const topRecommendations = scoredLines
      .filter((line) => !line.alreadyPresent)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 2);

    if (topRecommendations.length > 0) {
      await tx.recommendation.createMany({
        data: topRecommendations.map((line, index) => ({
          brandId,
          rank: index + 1,
          marketplaceId: line.marketplaceId,
          score: line.finalScore,
          priority: line.priority,
          whyText: buildRecommendationWhyText(brand, line),
          entryPlan: buildEntryPlan(brand, line),
          risks: buildRiskNote(brand, line),
          confidence:
            line.benchmarkConfidence === "high"
              ? "Elevee"
              : line.benchmarkConfidence === "medium"
              ? "Moyenne"
              : "Faible",
        })),
      });
    }

    const draftCampaign = `${AUTO_ACTIVATION_CAMPAIGN}:${brand.name}`;
    const sourceUrls = JSON.stringify(extractSourceUrls(brand.sources));
    const derivedEmail = deriveRecipientEmail(brand);
    const derivedFirstName = cleanString(brand.contactPersona) ?? null;
    const topMarketplaceIds = topRecommendations.map((line) => line.marketplaceId);

    await tx.campaignTarget.deleteMany({
      where: {
        brandId,
        campaign: draftCampaign,
        ...(topMarketplaceIds.length > 0 ? { marketplaceId: { notIn: topMarketplaceIds } } : {}),
      },
    });

    await tx.emailDraft.deleteMany({
      where: {
        brandId,
        campaign: draftCampaign,
        status: { in: ["PENDING", "EDITED", "FAILED"] },
      },
    });

    for (const line of topRecommendations) {
      await tx.campaignTarget.upsert({
        where: {
          brandId_marketplaceId_campaign: {
            brandId,
            marketplaceId: line.marketplaceId,
            campaign: draftCampaign,
          },
        },
        create: {
          brandId,
          marketplaceId: line.marketplaceId,
          campaign: draftCampaign,
          topScore: line.finalScore,
          priority: line.priority,
          contactRole: brand.contactRole ?? null,
          emailAngle: buildEmailAngle(brand, line),
          campaignNote: buildCampaignNote(brand, line),
          sourceUrls,
        },
        update: {
          topScore: line.finalScore,
          priority: line.priority,
          contactRole: brand.contactRole ?? null,
          emailAngle: buildEmailAngle(brand, line),
          campaignNote: buildCampaignNote(brand, line),
          sourceUrls,
          paused: false,
          stopped: false,
        },
      });

      await tx.emailDraft.create({
        data: {
          brandId,
          marketplaceId: line.marketplaceId,
          brandName: brand.name ?? "Unnamed Brand",
          marketplaceName: line.marketplaceName,
          campaign: draftCampaign,
          step: 1,
          branch: "AUTO_ACTIVATION",
          toEmail: derivedEmail,
          toFirstName: derivedFirstName,
          subject: buildDraftSubject(brand, line),
          bodyText: buildDraftBody(brand, line),
          cta: "Quick 15-minute fit call",
          stopRule: "Stop if the brand replies or requests no further outreach.",
          claimSources: sourceUrls,
          meta: JSON.stringify({
            autoGenerated: true,
            benchmarkScore: line.benchmarkScore,
            benchmarkMatchedBrands: line.benchmarkMatchedBrands,
            benchmarkConfidence: line.benchmarkConfidence,
          }),
          status: "PENDING",
        },
      });
    }
  });
}

function toBrandPersistenceData(brand: BrandEnrichmentInput) {
  return {
    name: brand.name ?? "Unnamed Brand",
    url: brand.url ?? undefined,
    country: brand.country ?? undefined,
    category: brand.category ?? undefined,
    foundedYear: brand.foundedYear ?? undefined,
    headquartersAddress: brand.headquartersAddress ?? undefined,
    companyType: brand.companyType ?? undefined,
    businessSignals: JSON.stringify(parseStringArray(brand.businessSignals)),
    genderFocus: brand.genderFocus ?? undefined,
    productType: brand.productType ?? undefined,
    productTags: JSON.stringify(parseStringArray(brand.productTags)),
    revenueMUsd: brand.revenueMUsd ?? undefined,
    headcount: brand.headcount ?? undefined,
    intlPresence: brand.intlPresence ?? undefined,
    sustainable: brand.sustainable ?? false,
    positioning: brand.positioning ?? undefined,
    existingMarketplaces: JSON.stringify(parseStringArray(brand.existingMarketplaces)),
    notes: brand.notes ?? undefined,
    sources: brand.sources ?? undefined,
    amazonSignal: brand.amazonSignal ?? undefined,
    zalandoSignal: brand.zalandoSignal ?? undefined,
    contactEmail: brand.contactEmail ?? undefined,
    contactRole: brand.contactRole ?? undefined,
    contactPersona: brand.contactPersona ?? undefined,
    contactSubjectHint: brand.contactSubjectHint ?? undefined,
    createdVia: brand.createdVia ?? "ENRICHED",
    sourceGroup: "MAIN",
  };
}

async function findExistingBrand(input: BrandEnrichmentInput) {
  const normalizedName = cleanString(input.name);
  const normalizedUrl = normalizeUrl(input.url);

  if (normalizedUrl) {
    const byUrl = await prisma.brand.findFirst({ where: { url: normalizedUrl } });
    if (byUrl) return byUrl;
  }

  if (normalizedName) {
    return prisma.brand.findFirst({ where: { name: normalizedName } });
  }

  return null;
}

function buildRecommendationWhyText(brand: BrandEnrichmentInput, line: ScoredLine) {
  const fragments = [
    brand.category ? `${brand.category} fit is strong` : null,
    brand.positioning ? `${brand.positioning} positioning aligns with ${line.marketplaceName}` : null,
    line.benchmarkScore ? `similar brands average ${line.benchmarkScore.toFixed(1)} here` : null,
  ].filter(Boolean);
  return fragments.join(". ");
}

function buildEntryPlan(brand: BrandEnrichmentInput, line: ScoredLine) {
  const signalText = parseStringArray(brand.businessSignals).slice(0, 2).join(", ");
  return `Lead with ${line.marketplaceName} as a ${line.priority} target${signalText ? `, leaning on ${signalText}` : ""}.`;
}

function buildRiskNote(brand: BrandEnrichmentInput, line: ScoredLine) {
  const risks = [
    !brand.sources ? "limited source coverage" : null,
    !brand.contactEmail && !brand.url ? "no reliable contact channel yet" : null,
    line.benchmarkConfidence === "low" ? "benchmark sample is still thin" : null,
  ].filter(Boolean);
  return risks.join(", ");
}

function buildEmailAngle(brand: BrandEnrichmentInput, line: ScoredLine) {
  if (/zalando/i.test(line.marketplaceName) && isAmazonNotZalando(brand.amazonSignal, brand.zalandoSignal)) {
    return "Bridge existing Amazon traction into Zalando demand";
  }
  if (brand.positioning) {
    return `Translate ${brand.positioning} positioning into ${line.marketplaceName}`;
  }
  return `Open a qualified ${line.marketplaceName} launch conversation`;
}

function buildCampaignNote(brand: BrandEnrichmentInput, line: ScoredLine) {
  return [
    `Auto-generated from enriched brand profile.`,
    line.benchmarkScore ? `Benchmark score: ${line.benchmarkScore.toFixed(1)}` : `No strong benchmark yet.`,
    brand.sources ? `Sources captured.` : `Sources still light.`,
  ].join(" ");
}

function buildDraftSubject(brand: BrandEnrichmentInput, line: ScoredLine) {
  if (/zalando/i.test(line.marketplaceName) && isAmazonNotZalando(brand.amazonSignal, brand.zalandoSignal)) {
    return `${brand.name}: from Amazon to ${line.marketplaceName}?`;
  }
  return `${brand.name}: why ${line.marketplaceName} could be next`;
}

function buildDraftBody(brand: BrandEnrichmentInput, line: ScoredLine) {
  const brandName = brand.name ?? "your brand";
  const category = brand.category ? `${brand.category.toLowerCase()} brand` : "brand";
  const positioning = brand.positioning ? `${brand.positioning.replaceAll("_", " ")} positioning` : "positioning";
  const signals = parseStringArray(brand.businessSignals).slice(0, 2).join(", ");
  const benchmarkSentence = line.benchmarkScore
    ? `Brands with a similar profile average ${line.benchmarkScore.toFixed(1)} on ${line.marketplaceName} in our benchmark set.`
    : `We already see a credible fit with ${line.marketplaceName} from the enrichment signals we captured.`;

  return [
    `Hi${brand.contactPersona ? ` ${brand.contactPersona}` : ""},`,
    ``,
    `${brandName} looks like a strong ${category} fit for ${line.marketplaceName}.`,
    benchmarkSentence,
    `${signals ? `Signals like ${signals} suggest` : `Your`} ${positioning} can translate well there without rebuilding everything from scratch.`,
    `Would a quick 15-minute call next week make sense to explore the launch path?`,
    ``,
    `Best,`,
    `Mehdi`,
  ].join("\n");
}

function deriveRecipientEmail(brand: BrandEnrichmentInput) {
  const explicit = cleanString(brand.contactEmail);
  if (explicit) return explicit;

  const normalizedUrl = normalizeUrl(brand.url);
  if (normalizedUrl) {
    try {
      const hostname = new URL(normalizedUrl).hostname.replace(/^www\./i, "");
      return `contact@${hostname}`;
    } catch {
      // Ignore parse failures.
    }
  }

  return "contact@example.com";
}

function extractSourceUrls(sources: string | null | undefined) {
  if (!sources) return [];
  const urls = sources.match(/https?:\/\/\S+/g);
  return urls ?? sources.split(/[,;\n|]+/).map((value) => value.trim()).filter(Boolean);
}

function normalizeUrl(url: string | null | undefined) {
  const trimmed = cleanString(url);
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function inferBrandNameFromUrl(url: string | null | undefined) {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return null;

  try {
    const hostname = new URL(normalizedUrl).hostname.replace(/^www\./i, "");
    const base = hostname.split(".")[0];
    return base
      .split(/[-_]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return null;
  }
}

function normalizeNumber(value: number | null | undefined) {
  return value == null || Number.isNaN(Number(value)) ? null : Number(value);
}

function normalizeInteger(value: number | null | undefined) {
  return value == null || Number.isNaN(Number(value)) ? null : Math.round(Number(value));
}

function cleanString(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function matchesLoose(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeToken(left);
  const normalizedRight = normalizeToken(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

function normalizeToken(value: string | null | undefined) {
  return (value ?? "").toLowerCase().trim();
}

function isAmazonNotZalando(amazonSignal: string | null | undefined, zalandoSignal: string | null | undefined) {
  return /oui|observed|signal|storefront|search/i.test(amazonSignal ?? "") && /\bnon\b|absent|pas de/i.test(zalandoSignal ?? "");
}
