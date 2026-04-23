import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  computeScore,
  priorityFromScore,
  type ScoringComponents,
  type ScoringWeightsInput,
} from "@/lib/scoring";
import { computeBrandPreview, saveBrandWithActivation } from "@/lib/brand-activation";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? "";
  const country = searchParams.get("country") ?? "";
  const priority = searchParams.get("priority") ?? "";
  const profileId = searchParams.get("profileId") ?? "";
  const take = Math.min(parseInt(searchParams.get("take") ?? "50"), 200);
  const skip = parseInt(searchParams.get("skip") ?? "0");

  const profile = profileId
    ? await prisma.scoringWeights.findUnique({ where: { id: profileId } })
    : null;
  const weights = profile ? profileToWeights(profile) : null;

  const brands = await prisma.brand.findMany({
    where: {
      AND: [
        q ? { name: { contains: q } } : {},
        category ? { category: { contains: category } } : {},
        country ? { country: { contains: country } } : {},
      ],
    },
    include: {
      recommendations: {
        orderBy: { rank: "asc" },
        take: 2,
        include: { marketplace: true },
      },
      scoringLines: {
        include: { marketplace: true },
        orderBy: { finalScore: "desc" },
      },
    },
    orderBy: { name: "asc" },
    take,
    skip,
  });

  const rows = brands.map((b) => {
    const rankedLines = weights
      ? b.scoringLines
          .map((sl) => {
            const score = computeScore(scoringLineToComponents(sl), weights);
            return {
              marketplaceName: sl.marketplace.name,
              marketplaceId: sl.marketplaceId,
              finalScore: score,
              priority: priorityFromScore(score),
              alreadyPresent: sl.alreadyPresent,
            };
          })
          .sort((a, b) => b.finalScore - a.finalScore)
      : b.scoringLines.map((sl) => ({
          marketplaceName: sl.marketplace.name,
          marketplaceId: sl.marketplaceId,
          finalScore: sl.finalScore,
          priority: sl.priority,
          alreadyPresent: sl.alreadyPresent,
        }));

    const eligibleLines = rankedLines.filter((sl) => !sl.alreadyPresent);
    const topTargets = weights
      ? eligibleLines.slice(0, 2).map((sl, idx) => ({
          rank: idx + 1,
          name: sl.marketplaceName,
          score: sl.finalScore,
          priority: sl.priority,
        }))
      : b.recommendations.map((r) => ({
          rank: r.rank,
          name: r.marketplace.name,
          score: r.score,
          priority: r.priority,
        }));
    const best = weights ? eligibleLines[0] ?? rankedLines[0] : rankedLines[0];

    return {
      id: b.id,
      name: b.name,
      url: b.url,
      country: b.country,
      category: b.category,
      foundedYear: b.foundedYear,
      headquartersAddress: b.headquartersAddress,
      companyType: b.companyType,
      genderFocus: b.genderFocus,
      productType: b.productType,
      sourceGroup: b.sourceGroup,
      bestScore: best?.finalScore ?? null,
      bestPriority: best?.priority ?? null,
      topMarketplace: topTargets[0]?.name ?? null,
      topMarketplaces: topTargets,
      scoringProfile: profile?.profileName ?? null,
      contactEmail: b.contactEmail,
      contactType: b.contactType,
      contactRole: b.contactRole,
      contactPersona: b.contactPersona,
      contactStatus: b.contactStatus,
      contactConfidence: b.contactConfidence,
      amazonSignal: b.amazonSignal,
      zalandoSignal: b.zalandoSignal,
      amazonNotZalando: isAmazonNotZalando(b.amazonSignal, b.zalandoSignal),
      createdVia: b.createdVia,
    };
  });

  const filtered = priority
    ? rows.filter((b) => b.bestPriority?.startsWith(priority) ?? false)
    : rows;

  return NextResponse.json(filtered);
}

function profileToWeights(profile: {
  wCategory: number;
  wGeo: number;
  wScale: number;
  wOps: number;
  wPositioning: number;
  wIncrementality: number;
  wStory: number;
  wPenalty: number;
  wPrior: number;
}): ScoringWeightsInput {
  return {
    wCategory: profile.wCategory,
    wGeo: profile.wGeo,
    wScale: profile.wScale,
    wOps: profile.wOps,
    wPositioning: profile.wPositioning,
    wIncrementality: profile.wIncrementality,
    wStory: profile.wStory,
    wPenalty: profile.wPenalty,
    wPrior: profile.wPrior,
  };
}

function scoringLineToComponents(line: ScoringComponents): ScoringComponents {
  return {
    fitCategory: line.fitCategory,
    fitGeo: line.fitGeo,
    commercialScale: line.commercialScale,
    opsReadiness: line.opsReadiness,
    fitPositioning: line.fitPositioning,
    incrementality: line.incrementality,
    sustainabilityStory: line.sustainabilityStory,
    baseCompletion: line.baseCompletion,
    penalty: line.penalty,
    initialPrior: line.initialPrior,
  };
}

function isAmazonNotZalando(amazonSignal: string | null, zalandoSignal: string | null) {
  const amazon = (amazonSignal ?? "").toLowerCase();
  const zalando = (zalandoSignal ?? "").toLowerCase();
  return /oui|observed|signal|storefront|search/.test(amazon) && /\bnon\b|absent|pas de/.test(zalando);
}

const CreateBrandSchema = z.object({
  name: z.string().min(1),
  url: z.string().optional(),
  country: z.string().optional(),
  category: z.string().optional(),
  foundedYear: z.number().int().nullable().optional(),
  headquartersAddress: z.string().optional(),
  companyType: z.string().optional(),
  businessSignals: z.array(z.string()).optional(),
  genderFocus: z.string().optional(),
  productType: z.string().optional(),
  positioning: z.string().optional(),
  notes: z.string().optional(),
  revenueMUsd: z.number().optional(),
  headcount: z.number().optional(),
  intlPresence: z.string().optional(),
  sustainable: z.boolean().optional(),
  existingMarketplaces: z.array(z.string()).optional(),
  productTags: z.array(z.string()).optional(),
  sources: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactRole: z.string().optional(),
  contactPersona: z.string().optional(),
  contactSubjectHint: z.string().optional(),
  amazonSignal: z.string().optional(),
  zalandoSignal: z.string().optional(),
  createdVia: z.enum(["WORKBOOK", "MANUAL", "ENRICHED"]).optional(),
});

export async function POST(request: NextRequest) {
  const parsed = CreateBrandSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const input = {
    name: data.name,
    url: data.url,
    country: data.country,
    category: data.category,
    foundedYear: data.foundedYear ?? null,
    headquartersAddress: data.headquartersAddress,
    companyType: data.companyType,
    businessSignals: data.businessSignals ?? [],
    genderFocus: data.genderFocus,
    productType: data.productType,
    positioning: data.positioning,
    notes: data.notes,
    revenueMUsd: data.revenueMUsd,
    headcount: data.headcount,
    intlPresence: data.intlPresence,
    sustainable: data.sustainable ?? false,
    existingMarketplaces: data.existingMarketplaces ?? [],
    productTags: data.productTags ?? [],
    sources: data.sources,
    contactEmail: data.contactEmail,
    contactRole: data.contactRole,
    contactPersona: data.contactPersona,
    contactSubjectHint: data.contactSubjectHint,
    amazonSignal: data.amazonSignal,
    zalandoSignal: data.zalandoSignal,
    createdVia: data.createdVia ?? "MANUAL",
  };

  try {
    const { brand, scores } = await saveBrandWithActivation(input);
    return NextResponse.json({ ...brand, scores }, { status: 201 });
  } catch (error) {
    const preview = await computeBrandPreview(input);
    const existing = await findExistingBrandForFallback(data.name, data.url);
    const persisted = existing
      ? await prisma.brand.update({
          where: { id: existing.id },
          data: toFallbackBrandData(input, preview.brand),
        })
      : await prisma.brand.create({
          data: toFallbackBrandData(input, preview.brand),
        });

    return NextResponse.json(
      {
        ...persisted,
        scores: preview.scores,
        activationWarning:
          error instanceof Error
            ? `Brand saved, but downstream activation failed: ${error.message}`
            : "Brand saved, but downstream activation failed.",
      },
      { status: 201 }
    );
  }
}

async function findExistingBrandForFallback(name: string, url?: string) {
  if (url) {
    const byUrl = await prisma.brand.findFirst({ where: { url } });
    if (byUrl) return byUrl;
  }

  return prisma.brand.findFirst({ where: { name } });
}

function toFallbackBrandData(
  input: {
    name: string;
    url?: string;
    country?: string;
    category?: string;
    foundedYear?: number | null;
    headquartersAddress?: string;
    companyType?: string;
    businessSignals?: string[];
    genderFocus?: string;
    productType?: string;
    positioning?: string;
    notes?: string;
    revenueMUsd?: number;
    headcount?: number;
    intlPresence?: string;
    sustainable?: boolean;
    existingMarketplaces?: string[];
    productTags?: string[];
    sources?: string;
    contactEmail?: string;
    contactRole?: string;
    contactPersona?: string;
    contactSubjectHint?: string;
    amazonSignal?: string;
    zalandoSignal?: string;
    createdVia?: "WORKBOOK" | "MANUAL" | "ENRICHED";
  },
  previewBrand: Record<string, unknown>
) {
  return {
    name: String(previewBrand.name ?? input.name),
    url: asOptionalString(previewBrand.url ?? input.url),
    country: asOptionalString(previewBrand.country ?? input.country),
    category: asOptionalString(previewBrand.category ?? input.category),
    foundedYear: asOptionalInt(previewBrand.foundedYear ?? input.foundedYear),
    headquartersAddress: asOptionalString(previewBrand.headquartersAddress ?? input.headquartersAddress),
    companyType: asOptionalString(previewBrand.companyType ?? input.companyType),
    businessSignals: JSON.stringify(asStringArray(previewBrand.businessSignals ?? input.businessSignals)),
    genderFocus: asOptionalString(previewBrand.genderFocus ?? input.genderFocus),
    productType: asOptionalString(previewBrand.productType ?? input.productType),
    productTags: JSON.stringify(asStringArray(previewBrand.productTags ?? input.productTags)),
    revenueMUsd: asOptionalNumber(previewBrand.revenueMUsd ?? input.revenueMUsd),
    headcount: asOptionalInt(previewBrand.headcount ?? input.headcount),
    intlPresence: asOptionalString(previewBrand.intlPresence ?? input.intlPresence),
    sustainable: Boolean(previewBrand.sustainable ?? input.sustainable ?? false),
    positioning: asOptionalString(previewBrand.positioning ?? input.positioning),
    existingMarketplaces: JSON.stringify(
      asStringArray(previewBrand.existingMarketplaces ?? input.existingMarketplaces)
    ),
    notes: asOptionalString(previewBrand.notes ?? input.notes),
    sources: asOptionalString(previewBrand.sources ?? input.sources),
    contactEmail: asOptionalString(input.contactEmail),
    contactRole: asOptionalString(input.contactRole),
    contactPersona: asOptionalString(input.contactPersona),
    contactSubjectHint: asOptionalString(input.contactSubjectHint),
    amazonSignal: asOptionalString(input.amazonSignal),
    zalandoSignal: asOptionalString(input.zalandoSignal),
    createdVia: input.createdVia ?? "MANUAL",
    sourceGroup: "MAIN",
  };
}

function asOptionalString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asOptionalNumber(value: unknown) {
  if (value == null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function asOptionalInt(value: unknown) {
  const number = asOptionalNumber(value);
  return number == null ? undefined : Math.round(number);
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;\n|]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}
