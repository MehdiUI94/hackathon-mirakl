import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { computeScore, priorityFromScore, type ScoringWeightsInput } from "@/lib/scoring";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const weights: ScoringWeightsInput = await req.json();

  const scoringLines = await prisma.scoringLine.findMany({
    where: { brandId: id },
    include: { marketplace: true },
  });

  const results = scoringLines.map((sl) => {
    const score = computeScore(
      {
        fitCategory: sl.fitCategory,
        fitGeo: sl.fitGeo,
        commercialScale: sl.commercialScale,
        opsReadiness: sl.opsReadiness,
        fitPositioning: sl.fitPositioning,
        incrementality: sl.incrementality,
        sustainabilityStory: sl.sustainabilityStory,
        baseCompletion: sl.baseCompletion,
        penalty: sl.penalty,
        initialPrior: sl.initialPrior,
      },
      weights
    );
    return {
      marketplaceId: sl.marketplaceId,
      marketplaceName: sl.marketplace.name,
      score,
      priority: priorityFromScore(score),
      components: {
        fitCategory: sl.fitCategory,
        fitGeo: sl.fitGeo,
        commercialScale: sl.commercialScale,
        opsReadiness: sl.opsReadiness,
        fitPositioning: sl.fitPositioning,
        incrementality: sl.incrementality,
        sustainabilityStory: sl.sustainabilityStory,
        baseCompletion: sl.baseCompletion,
        penalty: sl.penalty,
        initialPrior: sl.initialPrior,
      },
    };
  });

  results.sort((a, b) => b.score - a.score);

  return NextResponse.json(results);
}
