export interface ScoringComponents {
  fitCategory: number;
  fitGeo: number;
  commercialScale: number;
  opsReadiness: number;
  fitPositioning: number;
  incrementality: number;
  sustainabilityStory: number;
  baseCompletion: number;
  penalty: number;
  initialPrior: number;
}

export interface ScoringWeightsInput {
  wCategory: number;
  wGeo: number;
  wScale: number;
  wOps: number;
  wPositioning: number;
  wIncrementality: number;
  wStory: number;
  wPenalty: number;
  wPrior: number;
}

/**
 * Compute final score given component sub-scores and weights.
 * Formula: 0.90 × (Σ weighted_components + baseCompletion − penalty) + 0.10 × initialPrior
 */
export function computeScore(
  components: ScoringComponents,
  weights: ScoringWeightsInput
): number {
  const {
    fitCategory,
    fitGeo,
    commercialScale,
    opsReadiness,
    fitPositioning,
    incrementality,
    sustainabilityStory,
    baseCompletion,
    penalty,
    initialPrior,
  } = components;

  const totalWeight =
    weights.wCategory +
    weights.wGeo +
    weights.wScale +
    weights.wOps +
    weights.wPositioning +
    weights.wIncrementality +
    weights.wStory;

  // Normalize weights so they sum to 100
  const norm = totalWeight > 0 ? 100 / totalWeight : 1;

  const weightedSum =
    fitCategory * weights.wCategory * norm +
    fitGeo * weights.wGeo * norm +
    commercialScale * weights.wScale * norm +
    opsReadiness * weights.wOps * norm +
    fitPositioning * weights.wPositioning * norm +
    incrementality * weights.wIncrementality * norm +
    sustainabilityStory * weights.wStory * norm;

  const modelScore = (weightedSum + baseCompletion - penalty) / 10;
  const score = 0.9 * modelScore + 0.1 * initialPrior;
  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}

export const BALANCED_WEIGHTS: ScoringWeightsInput = {
  wCategory: 30,
  wGeo: 12,
  wScale: 15,
  wOps: 13,
  wPositioning: 12,
  wIncrementality: 8,
  wStory: 5,
  wPenalty: 0,
  wPrior: 10,
};

export function priorityFromScore(score: number): string {
  if (score >= 88) return "P1";
  if (score >= 82) return "P2";
  if (score >= 76) return "P3";
  return "Watchlist";
}
