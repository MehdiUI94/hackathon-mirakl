import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  computeScore,
  priorityFromScore,
  scoreBrandAgainstMarketplaces,
  type ScoringComponents,
  type ScoringWeightsInput,
} from "@/lib/scoring";

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
  positioning: z.string().optional(),
  notes: z.string().optional(),
  revenueMUsd: z.number().optional(),
  headcount: z.number().optional(),
  intlPresence: z.string().optional(),
  sustainable: z.boolean().optional(),
  existingMarketplaces: z.array(z.string()).optional(),
  productTags: z.array(z.string()).optional(),
  sources: z.string().optional(),
  createdVia: z.enum(["WORKBOOK", "MANUAL", "ENRICHED"]).optional(),
});

export async function POST(request: NextRequest) {
  const parsed = CreateBrandSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const brand = await prisma.brand.create({
    data: {
      name: data.name,
      url: data.url,
      country: data.country,
      category: data.category,
      positioning: data.positioning,
      notes: data.notes,
      revenueMUsd: data.revenueMUsd,
      headcount: data.headcount,
      intlPresence: data.intlPresence,
      sustainable: data.sustainable ?? false,
      existingMarketplaces: JSON.stringify(data.existingMarketplaces ?? []),
      productTags: JSON.stringify(data.productTags ?? []),
      sources: data.sources,
      createdVia: data.createdVia ?? "MANUAL",
      sourceGroup: "MAIN",
    },
  });

  // Score against all marketplaces and persist lines + top-2 recos
  const marketplaces = await prisma.marketplace.findMany();
  if (marketplaces.length > 0) {
    const scored = scoreBrandAgainstMarketplaces(brand, marketplaces);

    await prisma.scoringLine.createMany({
      data: scored.map((s) => ({
        brandId: brand.id,
        marketplaceId: s.marketplaceId,
        ...s.components,
        rawModelScore: s.finalScore,
        finalScore: s.finalScore,
        priority: s.priority,
        alreadyPresent: s.alreadyPresent,
      })),
    });

    const ranked = scored
      .filter((s) => !s.alreadyPresent)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 2);
    await prisma.recommendation.createMany({
      data: ranked.map((s, idx) => ({
        brandId: brand.id,
        rank: idx + 1,
        marketplaceId: s.marketplaceId,
        score: s.finalScore,
        priority: s.priority,
        confidence: "Moyenne",
      })),
    });
  }

  return NextResponse.json(brand, { status: 201 });
}
