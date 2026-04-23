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

  const contributionScale =
    fitCategory > 10 ||
    fitGeo > 10 ||
    commercialScale > 10 ||
    opsReadiness > 10 ||
    fitPositioning > 10;

  const ratio = (value: number, referenceWeight: number) => {
    const denominator = contributionScale ? referenceWeight : 10;
    return Math.max(0, Math.min(1, denominator > 0 ? value / denominator : 0));
  };

  const weightedSum =
    ratio(fitCategory, BALANCED_WEIGHTS.wCategory) * weights.wCategory +
    ratio(fitGeo, BALANCED_WEIGHTS.wGeo) * weights.wGeo +
    ratio(commercialScale, BALANCED_WEIGHTS.wScale) * weights.wScale +
    ratio(opsReadiness, BALANCED_WEIGHTS.wOps) * weights.wOps +
    ratio(fitPositioning, BALANCED_WEIGHTS.wPositioning) * weights.wPositioning +
    ratio(incrementality, BALANCED_WEIGHTS.wIncrementality) * weights.wIncrementality +
    ratio(sustainabilityStory, BALANCED_WEIGHTS.wStory) * weights.wStory;

  const priorBonus = (Math.max(0, Math.min(100, initialPrior)) / 100) * (weights.wPrior / 10);
  const penaltyMultiplier = 1 + Math.abs(weights.wPenalty) / 20;
  const score = weightedSum + baseCompletion - penalty * penaltyMultiplier + priorBonus;
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
  name?: string | null;
  url?: string | null;
  category?: string | null;
  country?: string | null;
  foundedYear?: number | null;
  headquartersAddress?: string | null;
  companyType?: string | null;
  businessSignals?: string[] | string | null;
  genderFocus?: string | null;
  productType?: string | null;
  productTags?: string[] | string | null;
  intlPresence?: string | null;
  revenueMUsd?: number | null;
  headcount?: number | null;
  positioning?: string | null;
  sustainable?: boolean | null;
  existingMarketplaces?: string[] | string | null;
  notes?: string | null;
  sources?: string | null;
  amazonSignal?: string | null;
  zalandoSignal?: string | null;
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
  benchmarkScore: number | null;
  benchmarkMatchedBrands: number;
  benchmarkConfidence: "low" | "medium" | "high";
}

export function scoreBrandAgainstMarketplaces(
  brand: BrandLike,
  marketplaces: MarketplaceLike[],
  weights: ScoringWeightsInput = BALANCED_WEIGHTS,
  benchmarkByMarketplace: Record<string, { averageScore: number; matchedBrands: number }> = {}
): ScoredLine[] {
  const existing = parseStringArray(brand.existingMarketplaces).map((s) => String(s).toLowerCase());
  const businessSignals = parseStringArray(brand.businessSignals);
  const productTags = parseStringArray(brand.productTags);

  return marketplaces.map((mp) => {
    const benchmark = benchmarkByMarketplace[mp.id] ?? null;
    const components: ScoringComponents = {
      fitCategory: estimateFitCategoryAdvanced(
        brand.category ?? "",
        brand.productType ?? "",
        productTags,
        mp.targetCategories
      ),
      fitGeo: estimateFitGeo(brand.country ?? "", brand.intlPresence ?? "", mp.winningGeos),
      commercialScale: estimateScaleAdvanced(
        brand.revenueMUsd ?? 0,
        brand.headcount ?? 0,
        brand.foundedYear ?? null,
        businessSignals
      ),
      opsReadiness: estimateOpsReadiness(brand, businessSignals),
      fitPositioning: estimatePositioningAdvanced(
        brand.positioning ?? "",
        brand.genderFocus ?? "",
        brand.companyType ?? "",
        mp.role ?? ""
      ),
      incrementality: estimateIncrementality(brand, mp.name, existing),
      sustainabilityStory: brand.sustainable ? 8 : 4,
      baseCompletion: estimateBaseCompletion(brand),
      penalty: estimatePenalty(brand, mp.name, existing),
      initialPrior: benchmark?.averageScore ?? estimateInitialPrior(brand, businessSignals),
    };
    const heuristicScore = computeScore(components, weights);
    const finalScore = benchmark
      ? roundScore(heuristicScore * 0.72 + benchmark.averageScore * 0.28)
      : heuristicScore;
    const alreadyPresent = existing.some((e) => mp.name.toLowerCase().includes(e) || e.includes(mp.name.toLowerCase()));
    return {
      marketplaceId: mp.id,
      marketplaceName: mp.name,
      components,
      finalScore,
      priority: priorityFromScore(finalScore),
      alreadyPresent,
      benchmarkScore: benchmark?.averageScore ?? null,
      benchmarkMatchedBrands: benchmark?.matchedBrands ?? 0,
      benchmarkConfidence:
        (benchmark?.matchedBrands ?? 0) >= 6 ? "high" : (benchmark?.matchedBrands ?? 0) >= 3 ? "medium" : "low",
    };
  });
}

export function parseStringArray(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Fall through to delimiter-based parsing.
  }
  return value
    .split(/[,;\n|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function estimateFitCategoryAdvanced(
  category: string,
  productType: string,
  productTags: string[],
  targetCategoriesJson: string
) {
  const base = estimateFitCategory(`${category} ${productType}`.trim(), targetCategoriesJson);
  if (base >= 8) return base;
  const tagsText = productTags.join(" ").toLowerCase();
  const targets = parseStringArray(targetCategoriesJson);
  if (targets.some((target) => tagsText.includes(target.toLowerCase()))) return Math.min(10, base + 2);
  return base;
}

function estimateScaleAdvanced(
  revenueMUsd: number,
  headcount: number,
  foundedYear: number | null,
  businessSignals: string[]
) {
  const base = estimateScale(revenueMUsd, headcount);
  const ageBoost =
    foundedYear && Number.isFinite(foundedYear)
      ? Math.min(2, Math.max(0, (new Date().getFullYear() - foundedYear) / 15))
      : 0;
  const signalBoost = businessSignals.some((signal) =>
    /wholesale|international|omnichannel|marketplace|d2c|b2b/i.test(signal)
  )
    ? 1
    : 0;
  return Math.min(10, roundScore(base + ageBoost + signalBoost));
}

function estimateOpsReadiness(brand: BrandLike, businessSignals: string[]) {
  let score = 3;
  if (brand.url) score += 1;
  if (brand.sources) score += 1;
  if ((brand.headcount ?? 0) >= 20) score += 1;
  if (brand.companyType) score += 1;
  if (businessSignals.some((signal) => /wholesale|erp|feeds?|catalog|distribution|marketplace/i.test(signal))) {
    score += 2;
  }
  return Math.min(10, score);
}

function estimatePositioningAdvanced(
  positioning: string,
  genderFocus: string,
  companyType: string,
  mpRole: string
) {
  const base = estimatePositioning(`${positioning} ${genderFocus} ${companyType}`.trim(), mpRole);
  if (/premium|luxury/i.test(positioning) && /department|premium|luxury/i.test(mpRole)) {
    return Math.min(10, base + 1);
  }
  return base;
}

function estimateIncrementality(
  brand: BrandLike,
  marketplaceName: string,
  existingMarketplaces: string[]
) {
  const name = marketplaceName.toLowerCase();
  if (existingMarketplaces.some((value) => name.includes(value) || value.includes(name))) return 1;

  let score = 5;
  if (/zalando/i.test(marketplaceName) && isAmazonNotZalando(brand.amazonSignal, brand.zalandoSignal)) {
    score += 4;
  }
  if (/amazon/i.test(marketplaceName) && isObserved(brand.amazonSignal)) {
    score -= 2;
  }
  if (existingMarketplaces.length === 0) score += 1;
  return Math.max(1, Math.min(10, score));
}

function estimateBaseCompletion(brand: BrandLike) {
  const checks = [
    brand.name,
    brand.url,
    brand.category,
    brand.country,
    brand.positioning,
    brand.productType,
    brand.genderFocus,
    brand.companyType,
    brand.foundedYear,
    brand.headquartersAddress,
    brand.sources,
    brand.notes,
    brand.headcount,
    brand.businessSignals,
  ];
  const present = checks.filter((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    return Boolean(value && String(value).trim() !== "");
  }).length;
  return Math.min(9, 2 + (present / checks.length) * 6);
}

function estimatePenalty(brand: BrandLike, marketplaceName: string, existingMarketplaces: string[]) {
  let penalty = 0;
  if (!brand.url) penalty += 0.4;
  if (!brand.sources) penalty += 0.6;
  if (!brand.category) penalty += 0.6;
  if (!brand.headcount && !brand.revenueMUsd) penalty += 0.4;
  const name = marketplaceName.toLowerCase();
  if (existingMarketplaces.some((value) => name.includes(value) || value.includes(name))) penalty += 5;
  return roundScore(penalty);
}

function estimateInitialPrior(brand: BrandLike, businessSignals: string[]) {
  let prior = 32;
  if (brand.url) prior += 8;
  if ((brand.headcount ?? 0) >= 50) prior += 10;
  if (brand.positioning) prior += 8;
  if (brand.category) prior += 8;
  if (brand.sources) prior += 8;
  if (businessSignals.some((signal) => /marketplace|amazon|zalando|wholesale|retail/i.test(signal))) {
    prior += 10;
  }
  return Math.min(90, prior);
}

function roundScore(value: number) {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

function isAmazonNotZalando(amazonSignal: string | null | undefined, zalandoSignal: string | null | undefined) {
  return isObserved(amazonSignal) && isAbsent(zalandoSignal);
}

function isObserved(value: string | null | undefined) {
  return /oui|observed|signal|storefront|search/i.test(value ?? "");
}

function isAbsent(value: string | null | undefined) {
  return /\bnon\b|absent|pas de/i.test(value ?? "");
}
