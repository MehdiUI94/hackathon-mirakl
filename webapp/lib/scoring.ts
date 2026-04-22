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

// ---- Heuristic scorers for newly-added brands ----

export function estimateFitCategory(category: string, targetCategoriesJson: string): number {
  const targets = JSON.parse(targetCategoriesJson || "[]") as string[];
  if (!category || targets.length === 0) return 5;
  const cat = category.toLowerCase();
  for (const t of targets) {
    const tl = t.toLowerCase();
    if (cat.includes(tl) || tl.includes(cat)) return 9;
  }
  return 4;
}

export function estimateFitGeo(country: string, intl: string, winningGeosJson: string): number {
  const geos = JSON.parse(winningGeosJson || "[]") as string[];
  const combined = `${country} ${intl}`.toLowerCase();
  if (geos.length === 0) return 5;
  for (const g of geos) {
    if (combined.includes(g.toLowerCase())) return 9;
  }
  return 4;
}

export function estimateScale(revenueMUsd: number, headcount: number): number {
  if (revenueMUsd > 50 || headcount > 500) return 9;
  if (revenueMUsd > 20 || headcount > 200) return 7;
  if (revenueMUsd > 5 || headcount > 50) return 5;
  return 3;
}

export function estimatePositioning(positioning: string, mpRole: string): number {
  const pos = positioning.toLowerCase();
  const role = mpRole.toLowerCase();
  if ((pos.includes("premium") || pos.includes("luxury")) && role.includes("premium")) return 9;
  if (pos.includes("mass") && role.includes("mass")) return 8;
  if (pos.includes("mid") && !role.includes("luxury")) return 7;
  return 5;
}

export interface BrandLike {
  category?: string | null;
  country?: string | null;
  intlPresence?: string | null;
  revenueMUsd?: number | null;
  headcount?: number | null;
  positioning?: string | null;
  sustainable?: boolean | null;
  existingMarketplaces?: string[] | string | null;
}

export interface MarketplaceLike {
  id: string;
  name: string;
  role?: string | null;
  targetCategories: string;
  winningGeos: string;
}

export interface ScoredLine {
  marketplaceId: string;
  marketplaceName: string;
  components: ScoringComponents;
  finalScore: number;
  priority: string;
  alreadyPresent: boolean;
}

export function scoreBrandAgainstMarketplaces(
  brand: BrandLike,
  marketplaces: MarketplaceLike[],
  weights: ScoringWeightsInput = BALANCED_WEIGHTS
): ScoredLine[] {
  const existing = (() => {
    if (Array.isArray(brand.existingMarketplaces)) return brand.existingMarketplaces;
    if (typeof brand.existingMarketplaces === "string") {
      try {
        const parsed = JSON.parse(brand.existingMarketplaces);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  })().map((s) => String(s).toLowerCase());

  return marketplaces.map((mp) => {
    const components: ScoringComponents = {
      fitCategory: estimateFitCategory(brand.category ?? "", mp.targetCategories),
      fitGeo: estimateFitGeo(brand.country ?? "", brand.intlPresence ?? "", mp.winningGeos),
      commercialScale: estimateScale(brand.revenueMUsd ?? 0, brand.headcount ?? 0),
      opsReadiness: 5,
      fitPositioning: estimatePositioning(brand.positioning ?? "", mp.role ?? ""),
      incrementality: 5,
      sustainabilityStory: brand.sustainable ? 8 : 4,
      baseCompletion: 3,
      penalty: 0,
      initialPrior: 0,
    };
    const finalScore = computeScore(components, weights);
    const alreadyPresent = existing.some((e) => mp.name.toLowerCase().includes(e) || e.includes(mp.name.toLowerCase()));
    return {
      marketplaceId: mp.id,
      marketplaceName: mp.name,
      components,
      finalScore,
      priority: priorityFromScore(finalScore),
      alreadyPresent,
    };
  });
}
