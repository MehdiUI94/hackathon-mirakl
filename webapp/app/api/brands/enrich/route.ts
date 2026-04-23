import Anthropic from "@anthropic-ai/sdk";
import { computeBrandPreview } from "@/lib/brand-activation";
import { prisma } from "@/lib/db";
import {
  getSuggestionHostname,
  KNOWN_BRAND_SUGGESTIONS,
  normalizeBrandText,
} from "@/lib/known-brand-suggestions";
import { NextRequest } from "next/server";
import * as cheerio from "cheerio";

function sse(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(msg));
}

type BrandReference = {
  name?: string | null;
  url?: string | null;
  country?: string | null;
  category?: string | null;
  foundedYear?: number | null;
  headquartersAddress?: string | null;
  companyType?: string | null;
  businessSignals?: string[];
  genderFocus?: string | null;
  productType?: string | null;
  productTags?: string[];
  revenueMUsd?: number | null;
  headcount?: number | null;
  intlPresence?: string | null;
  sustainable?: boolean | null;
  positioning?: string | null;
  existingMarketplaces?: string[];
  sources?: string | null;
  notes?: string | null;
};

export async function POST(req: NextRequest) {
  const { url, name } = (await req.json()) as { url?: string; name?: string };
  if (!url && !name) {
    return new Response("url or name required", { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        sse(controller, "progress", { step: "scrape", message: "Fetching brand website..." });

        let pageText = "";
        let resolvedUrl = url ?? "";
        let pageTitle = "";
        let metaDescription = "";

        if (resolvedUrl) {
          try {
            const normalized = normalizeUrlHint(resolvedUrl);
            const pageRes = await fetch(normalized, {
              signal: AbortSignal.timeout(8000),
              headers: { "User-Agent": "Mozilla/5.0 (compatible; MGEBot/1.0)" },
            });
            const html = await pageRes.text();
            const $ = cheerio.load(html);
            $("script, style, nav, footer, header").remove();
            pageTitle = $("title").first().text().trim();
            metaDescription =
              $('meta[name="description"]').attr("content")?.trim() ??
              $('meta[property="og:description"]').attr("content")?.trim() ??
              "";
            pageText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 4000);
            sse(controller, "progress", {
              step: "scrape",
              message: `Scraped ${pageText.length} chars`,
            });
          } catch {
            sse(controller, "progress", {
              step: "scrape",
              message: "Scrape failed - proceeding without page content",
            });
          }
        }

        const existingBrandReference = await findExistingBrandReference(name, resolvedUrl);
        const knownSuggestion = findKnownBrandReference(name, resolvedUrl);

        sse(controller, "progress", { step: "llm", message: "Extracting brand data with LLM..." });

        const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
        const apiKey = settings?.llmApiKey;

        let brandData: Record<string, unknown> = {
          name: name ?? resolvedUrl,
          url: resolvedUrl,
          country: null,
          category: null,
          foundedYear: null,
          headquartersAddress: null,
          companyType: null,
          businessSignals: [],
          genderFocus: null,
          productType: null,
          productTags: [],
          revenueMUsd: null,
          headcount: null,
          intlPresence: null,
          sustainable: false,
          positioning: null,
          existingMarketplaces: [],
          sources: resolvedUrl || null,
          notes: null,
        };

        brandData = mergeBrandData(
          brandData,
          buildHeuristicBrandSeed(knownSuggestion, existingBrandReference, resolvedUrl, name)
        );

        let llmSucceeded = false;

        if (apiKey && apiKey !== "***") {
          try {
            const client = new Anthropic({ apiKey });
            const prompt = `You are a fashion industry analyst. Extract structured data about this brand from the provided web content.

Brand URL: ${resolvedUrl || "unknown"}
Brand Name hint: ${name ?? "unknown"}
Page title: ${pageTitle || "(no title available)"}
Meta description: ${metaDescription || "(no meta description available)"}
Page content: ${pageText || "(no page content available)"}

Return a JSON object with these fields:
- name: string (brand name)
- url: string | null (official website url)
- country: string (brand's home country, ISO or full name)
- category: string (main fashion category: e.g. "Womenswear RTW", "Fine Jewelry", "Outdoor", "Menswear", "Accessories", "Luxury", "Childrenswear", "Sportswear")
- foundedYear: number | null (year brand was founded)
- headquartersAddress: string | null (best available HQ city/address)
- companyType: string | null (e.g. independent brand, designer label, group-owned, DNVB)
- businessSignals: string[] (4-6 concrete business signals: wholesale, Amazon presence, retail footprint, omnichannel, international, premium wholesale...)
- genderFocus: string | null (women, men, unisex, kids, mixed)
- productType: string | null (apparel, footwear, jewelry, accessories, beauty, home, mixed)
- productTags: string[] (3-5 specific product keywords)
- revenueMUsd: number | null (estimated annual revenue in USD millions, or null)
- headcount: number | null (estimated employee count, or null)
- intlPresence: string (e.g. "Europe, USA" or "France only" or null)
- sustainable: boolean (true if brand emphasizes sustainability/ethics)
- positioning: string (e.g. "accessible_premium", "luxury", "mid_market", "mass_market")
- existingMarketplaces: string[] (known marketplace presences: Zalando, Amazon, ASOS, etc.)
- sources: string (source URLs or source notes supporting the extraction)
- notes: string (1-2 key observations about brand fit)

Respond with only valid JSON, no markdown.`;

            const message = await client.messages.create({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 512,
              messages: [{ role: "user", content: prompt }],
            });

            const text = message.content[0].type === "text" ? message.content[0].text : "{}";
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              brandData = { ...brandData, ...JSON.parse(jsonMatch[0]) };
              llmSucceeded = true;
            }
          } catch (err) {
            sse(controller, "progress", {
              step: "llm",
              message: `LLM extraction failed: ${err instanceof Error ? err.message : "unknown"}`,
            });
          }
        } else {
          sse(controller, "progress", {
            step: "llm",
            message: "No LLM API key configured - using heuristic enrichment",
          });
        }

        brandData = mergeBrandData(
          brandData,
          inferFallbackBrandData({
            nameHint: name,
            resolvedUrl,
            pageTitle,
            metaDescription,
            pageText,
            knownSuggestion,
            existingBrandReference,
            preferAggressiveDefaults: !llmSucceeded,
          })
        );

        if (!resolvedUrl && typeof brandData.url === "string") {
          resolvedUrl = brandData.url;
        }

        sse(controller, "progress", {
          step: "score",
          message: "Computing marketplace scores with benchmark...",
        });
        const preview = await computeBrandPreview({
          ...brandData,
          url: resolvedUrl || String(brandData.url ?? ""),
          name: String(brandData.name ?? name ?? resolvedUrl ?? ""),
          createdVia: "ENRICHED",
        });

        sse(controller, "progress", { step: "done", message: "Enrichment complete" });
        sse(controller, "result", { brand: preview.brand, scores: preview.scores });
      } catch (err) {
        sse(controller, "error", {
          message: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function mergeBrandData(base: Record<string, unknown>, patch: Record<string, unknown>) {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isMeaningfulValue(value) && !isMeaningfulValue(next[key])) {
      next[key] = value;
    }
  }
  return next;
}

function isMeaningfulValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" ? value.trim().length > 0 : value != null;
}

function buildHeuristicBrandSeed(
  knownSuggestion: { name: string; url: string; category: string } | null,
  existingBrandReference: BrandReference | null,
  resolvedUrl: string,
  name?: string
) {
  const baseName = existingBrandReference?.name ?? knownSuggestion?.name ?? name ?? null;
  const category = existingBrandReference?.category ?? knownSuggestion?.category ?? null;

  return {
    name: baseName,
    url: existingBrandReference?.url ?? knownSuggestion?.url ?? resolvedUrl ?? null,
    category,
    productType: existingBrandReference?.productType ?? inferProductTypeFromCategory(category),
    genderFocus: existingBrandReference?.genderFocus ?? inferGenderFocusFromCategory(category),
    positioning:
      existingBrandReference?.positioning ?? inferPositioningFromBrandName(baseName, category),
    businessSignals:
      existingBrandReference?.businessSignals ?? inferBusinessSignalsFromCategory(category),
    existingMarketplaces: existingBrandReference?.existingMarketplaces ?? [],
    country: existingBrandReference?.country ?? null,
    foundedYear: existingBrandReference?.foundedYear ?? null,
    headquartersAddress: existingBrandReference?.headquartersAddress ?? null,
    companyType: existingBrandReference?.companyType ?? null,
    revenueMUsd: existingBrandReference?.revenueMUsd ?? null,
    headcount: existingBrandReference?.headcount ?? null,
    intlPresence: existingBrandReference?.intlPresence ?? null,
    sustainable: existingBrandReference?.sustainable ?? false,
    productTags: existingBrandReference?.productTags ?? [],
    sources: existingBrandReference?.sources ?? knownSuggestion?.url ?? resolvedUrl ?? null,
    notes: existingBrandReference?.notes ?? null,
  };
}

function inferFallbackBrandData({
  nameHint,
  resolvedUrl,
  pageTitle,
  metaDescription,
  pageText,
  knownSuggestion,
  existingBrandReference,
  preferAggressiveDefaults,
}: {
  nameHint?: string;
  resolvedUrl: string;
  pageTitle: string;
  metaDescription: string;
  pageText: string;
  knownSuggestion: { name: string; url: string; category: string } | null;
  existingBrandReference: BrandReference | null;
  preferAggressiveDefaults: boolean;
}) {
  const fullText = [pageTitle, metaDescription, pageText].filter(Boolean).join(" ");
  const normalizedText = fullText.toLowerCase();
  const normalizedName = normalizeBrandText(
    existingBrandReference?.name ??
      knownSuggestion?.name ??
      nameHint ??
      inferNameFromTitle(pageTitle) ??
      ""
  );
  const inferredCategory =
    existingBrandReference?.category ??
    knownSuggestion?.category ??
    inferCategoryFromText(normalizedText, normalizedName);
  const inferredSignals = uniqStrings([
    ...(existingBrandReference?.businessSignals ?? []),
    ...inferBusinessSignalsFromText(normalizedText),
    ...(preferAggressiveDefaults ? inferBusinessSignalsFromCategory(inferredCategory) : []),
  ]);

  return {
    name:
      existingBrandReference?.name ??
      knownSuggestion?.name ??
      nameHint ??
      inferNameFromTitle(pageTitle) ??
      inferNameFromUrl(resolvedUrl),
    url: existingBrandReference?.url ?? knownSuggestion?.url ?? normalizeUrlHint(resolvedUrl),
    category: inferredCategory,
    country: existingBrandReference?.country ?? inferCountryFromUrl(resolvedUrl),
    foundedYear: existingBrandReference?.foundedYear ?? inferFoundedYear(normalizedText),
    headquartersAddress:
      existingBrandReference?.headquartersAddress ??
      (preferAggressiveDefaults ? inferHeadquarters(normalizedText) : null),
    companyType:
      existingBrandReference?.companyType ??
      inferCompanyType(normalizedText, normalizedName),
    businessSignals: inferredSignals,
    genderFocus:
      existingBrandReference?.genderFocus ??
      inferGenderFocusFromCategory(inferredCategory) ??
      inferGenderFocusFromText(normalizedText),
    productType:
      existingBrandReference?.productType ??
      inferProductTypeFromText(normalizedText) ??
      inferProductTypeFromCategory(inferredCategory),
    productTags:
      existingBrandReference?.productTags ??
      inferProductTags(normalizedText, inferredCategory),
    revenueMUsd: existingBrandReference?.revenueMUsd ?? null,
    headcount: existingBrandReference?.headcount ?? null,
    intlPresence: existingBrandReference?.intlPresence ?? inferIntlPresence(normalizedText),
    sustainable:
      existingBrandReference?.sustainable ??
      /sustainab|responsib|recycl|organic|traceab|circular/i.test(normalizedText),
    positioning:
      existingBrandReference?.positioning ??
      inferPositioningFromText(normalizedText) ??
      inferPositioningFromBrandName(nameHint ?? knownSuggestion?.name ?? null, inferredCategory),
    existingMarketplaces: uniqStrings([
      ...(existingBrandReference?.existingMarketplaces ?? []),
      ...inferMarketplaceSignals(normalizedText),
    ]),
    sources:
      existingBrandReference?.sources ??
      (uniqStrings([normalizeUrlHint(resolvedUrl), knownSuggestion?.url]).join(", ") || null),
    notes:
      existingBrandReference?.notes ??
      buildFallbackNote(
        inferredCategory,
        inferPositioningFromText(normalizedText) ??
          inferPositioningFromBrandName(nameHint ?? knownSuggestion?.name ?? null, inferredCategory),
        inferredSignals
      ),
  };
}

async function findExistingBrandReference(name?: string, resolvedUrl?: string) {
  const normalizedName = normalizeBrandText(name ?? "");
  const normalizedHostname = resolvedUrl ? getSuggestionHostname(resolvedUrl) : "";
  const filters: Array<Record<string, unknown>> = [];

  if (name?.trim()) filters.push({ name: { contains: name.trim() } });
  if (normalizedHostname) filters.push({ url: { contains: normalizedHostname } });
  if (filters.length === 0) return null;

  const brands = await prisma.brand.findMany({
    where: { OR: filters },
    select: {
      name: true,
      url: true,
      country: true,
      category: true,
      foundedYear: true,
      headquartersAddress: true,
      companyType: true,
      businessSignals: true,
      genderFocus: true,
      productType: true,
      productTags: true,
      revenueMUsd: true,
      headcount: true,
      intlPresence: true,
      sustainable: true,
      positioning: true,
      existingMarketplaces: true,
      sources: true,
      notes: true,
    },
    take: 12,
  });

  const matched =
    brands.find((brand) => {
      const brandName = normalizeBrandText(brand.name);
      const brandHostname = getSuggestionHostname(brand.url ?? "");
      return (
        (!!normalizedName && brandName === normalizedName) ||
        (!!normalizedHostname && brandHostname === normalizedHostname)
      );
    }) ?? brands[0];

  if (!matched) return null;

  return {
    ...matched,
    businessSignals: parseJsonStringArray(matched.businessSignals),
    productTags: parseJsonStringArray(matched.productTags),
    existingMarketplaces: parseJsonStringArray(matched.existingMarketplaces),
  } satisfies BrandReference;
}

function findKnownBrandReference(name?: string, resolvedUrl?: string) {
  const normalizedName = normalizeBrandText(name ?? "");
  const normalizedHostname = resolvedUrl ? getSuggestionHostname(resolvedUrl) : "";
  return (
    KNOWN_BRAND_SUGGESTIONS.find((brand) => normalizeBrandText(brand.name) === normalizedName) ??
    KNOWN_BRAND_SUGGESTIONS.find((brand) => getSuggestionHostname(brand.url) === normalizedHostname) ??
    null
  );
}

function parseJsonStringArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((entry) => String(entry).trim()).filter(Boolean)
      : [];
  } catch {
    return value
      .split(/[,;\n|]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
}

function inferCategoryFromText(text: string, normalizedName: string) {
  if (/jewel|watch|fine jewelry|bijou/.test(text)) return "Fine Jewelry";
  if (/beauty|skincare|makeup|fragrance|cosmetic/.test(text)) return "Beauty";
  if (/home|furniture|decor|bedding/.test(text)) return "Homewear";
  if (/sport|running|fitness|outdoor|performance/.test(text)) return "Sportswear";
  if (/kid|baby|children|junior/.test(text)) return "Childrenswear";
  if (/shoe|sneaker|boot|heel|loafer/.test(text)) return "Footwear";
  if (/bag|accessor|leather goods|belt|wallet/.test(text)) return "Accessories";
  if (/men|menswear|homme/.test(text) && !/women|womenswear|femme/.test(text)) return "Menswear";
  if (/women|womenswear|femme|dress|tops|skirts|blazer/.test(text)) return "Womenswear RTW";
  if (normalizedName.includes("zara")) return "Womenswear RTW";
  return null;
}

function inferGenderFocusFromText(text: string) {
  if (/women|femme/.test(text) && /men|homme/.test(text)) return "mixed";
  if (/kid|baby|children|junior/.test(text)) return "kids";
  if (/men|homme/.test(text)) return "men";
  if (/women|femme/.test(text)) return "women";
  return null;
}

function inferProductTypeFromText(text: string) {
  if (/beauty|skincare|makeup|fragrance|cosmetic/.test(text)) return "beauty";
  if (/home|furniture|decor|bedding/.test(text)) return "home";
  if (/shoe|sneaker|boot|heel|loafer/.test(text)) return "footwear";
  if (/bag|belt|wallet|accessor/.test(text)) return "accessories";
  if (/dress|shirt|jeans|coat|trouser|tops|skirt|outerwear/.test(text)) return "apparel";
  return null;
}

function inferPositioningFromText(text: string) {
  if (/luxury|designer|couture/.test(text)) return "luxury";
  if (/premium|elevated|contemporary/.test(text)) return "accessible_premium";
  if (/affordable|everyday|basics|fast fashion/.test(text)) return "mass_market";
  return null;
}

function inferPositioningFromBrandName(
  name: string | null | undefined,
  category: string | null | undefined
) {
  const normalized = normalizeBrandText(name ?? "");
  if (/(zara|h m|hm|primark|kiabi|bershka|stradivarius|pull and bear|mango)/.test(normalized)) {
    return "mass_market";
  }
  if (/(massimo dutti|cos|arket)/.test(normalized)) {
    return "accessible_premium";
  }
  if (/luxury/i.test(category ?? "")) return "luxury";
  return null;
}

function inferBusinessSignalsFromText(text: string) {
  const signals: string[] = [];
  if (/worldwide|international|global|countries|stores worldwide|available in/.test(text)) {
    signals.push("international retail footprint");
  }
  if (/online|ecommerce|shop online|app/.test(text)) {
    signals.push("omnichannel ecommerce");
  }
  if (/store locator|stores|flagship|retail/.test(text)) {
    signals.push("owned retail network");
  }
  if (/new collection|weekly drops|trend|fast fashion/.test(text)) {
    signals.push("high merchandising cadence");
  }
  if (/marketplace|amazon|zalando|asos/.test(text)) {
    signals.push("marketplace-ready assortment");
  }
  return signals;
}

function inferBusinessSignalsFromCategory(category: string | null | undefined) {
  if (!category) return [];
  if (/sportswear/i.test(category)) return ["performance assortment", "omnichannel ecommerce"];
  if (/womenswear|menswear|childrenswear/i.test(category)) {
    return [
      "international retail footprint",
      "omnichannel ecommerce",
      "seasonal assortment depth",
    ];
  }
  if (/accessories|footwear/i.test(category)) {
    return ["category specialization", "omnichannel ecommerce"];
  }
  return [];
}

function inferMarketplaceSignals(text: string) {
  const marketplaces = [];
  if (/amazon/.test(text)) marketplaces.push("Amazon");
  if (/zalando/.test(text)) marketplaces.push("Zalando");
  if (/asos/.test(text)) marketplaces.push("ASOS");
  if (/about you/.test(text)) marketplaces.push("About You");
  return marketplaces;
}

function inferProductTypeFromCategory(category: string | null | undefined) {
  if (!category) return null;
  if (/jewelry/i.test(category)) return "jewelry";
  if (/beauty/i.test(category)) return "beauty";
  if (/home/i.test(category)) return "home";
  if (/footwear/i.test(category)) return "footwear";
  if (/accessories/i.test(category)) return "accessories";
  return "apparel";
}

function inferGenderFocusFromCategory(category: string | null | undefined) {
  if (!category) return null;
  if (/menswear/i.test(category)) return "men";
  if (/childrenswear/i.test(category)) return "kids";
  if (/womenswear/i.test(category)) return "women";
  return "mixed";
}

function inferCountryFromUrl(resolvedUrl: string) {
  const hostname = getSuggestionHostname(resolvedUrl);
  if (hostname.endsWith(".fr")) return "France";
  if (hostname.endsWith(".de")) return "Germany";
  if (hostname.endsWith(".es")) return "Spain";
  if (hostname.endsWith(".it")) return "Italy";
  if (hostname.endsWith(".co.uk") || hostname.endsWith(".uk")) return "United Kingdom";
  return null;
}

function inferFoundedYear(text: string) {
  const match = text.match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function inferHeadquarters(text: string) {
  const match = text.match(/headquartered in ([a-z\s-]+)/i);
  return match ? match[1].trim() : null;
}

function inferCompanyType(text: string, normalizedName: string) {
  if (/group|holding|inditex|lvmh|kering/.test(text)) return "group-owned";
  if (/designer/.test(text)) return "designer label";
  if (/dnvb|direct[- ]to[- ]consumer|d2c/.test(text)) return "DNVB";
  if (/(zara|mango|bershka|stradivarius|pull and bear)/.test(normalizedName)) {
    return "group-owned";
  }
  return "independent brand";
}

function inferIntlPresence(text: string) {
  if (/worldwide|global|international|countries/.test(text)) return "International";
  if (/europe/.test(text) && /usa|united states|north america/.test(text)) return "Europe, USA";
  if (/europe/.test(text)) return "Europe";
  return null;
}

function inferProductTags(text: string, category: string | null) {
  const pool = [
    "dresses",
    "tops",
    "denim",
    "outerwear",
    "footwear",
    "bags",
    "accessories",
    "activewear",
    "kidswear",
    "beauty",
  ];
  const tags = pool.filter((tag) => text.includes(tag.replace(/wear$/, ""))).slice(0, 4);
  if (tags.length > 0) return tags;
  if (/womenswear|menswear|childrenswear/i.test(category ?? "")) {
    return ["apparel", "seasonal drops"];
  }
  return [];
}

function buildFallbackNote(
  category: string | null,
  positioning: string | null,
  signals: string[]
) {
  const parts = [
    category ? `Detected ${category} profile.` : null,
    positioning ? `Likely ${positioning.replaceAll("_", " ")} positioning.` : null,
    signals.length > 0 ? `Signals suggest ${signals.slice(0, 2).join(" and ")}.` : null,
  ].filter(Boolean);
  return parts.join(" ");
}

function inferNameFromTitle(pageTitle: string) {
  const trimmed = pageTitle.trim();
  if (!trimmed) return null;
  const candidate = trimmed.split(/[|\\-–:]/)[0]?.trim();
  return candidate || null;
}

function inferNameFromUrl(resolvedUrl: string) {
  const hostname = getSuggestionHostname(resolvedUrl);
  if (!hostname) return null;
  return hostname
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function uniqStrings(values: Array<string | string[] | null | undefined>) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeUrlHint(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}
