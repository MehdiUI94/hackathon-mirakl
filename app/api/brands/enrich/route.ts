import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";
import * as cheerio from "cheerio";
import Anthropic from "@anthropic-ai/sdk";
import { computeScore, priorityFromScore, BALANCED_WEIGHTS } from "@/lib/scoring";

function sse(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(msg));
}

export async function POST(req: NextRequest) {
  const { url, name } = await req.json() as { url?: string; name?: string };
  if (!url && !name) {
    return new Response("url or name required", { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        sse(controller, "progress", { step: "scrape", message: "Fetching brand website…" });

        let pageText = "";
        let resolvedUrl = url ?? "";

        // Step 1: scrape
        if (resolvedUrl) {
          try {
            const normalized = resolvedUrl.startsWith("http")
              ? resolvedUrl
              : `https://${resolvedUrl}`;
            const pageRes = await fetch(normalized, {
              signal: AbortSignal.timeout(8000),
              headers: { "User-Agent": "Mozilla/5.0 (compatible; MGEBot/1.0)" },
            });
            const html = await pageRes.text();
            const $ = cheerio.load(html);
            $("script, style, nav, footer, header").remove();
            pageText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 3000);
            sse(controller, "progress", { step: "scrape", message: `Scraped ${pageText.length} chars` });
          } catch {
            sse(controller, "progress", { step: "scrape", message: "Scrape failed — proceeding without page content" });
          }
        }

        // Step 2: LLM extraction
        sse(controller, "progress", { step: "llm", message: "Extracting brand data with LLM…" });

        const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
        const apiKey = settings?.llmApiKey;

        let brandData: Record<string, unknown> = {
          name: name ?? resolvedUrl,
          url: resolvedUrl,
          country: null,
          category: null,
          productTags: [],
          revenueMUsd: null,
          headcount: null,
          intlPresence: null,
          sustainable: false,
          positioning: null,
          existingMarketplaces: [],
          notes: null,
        };

        if (apiKey && apiKey !== "***") {
          try {
            const client = new Anthropic({ apiKey });
            const prompt = `You are a fashion industry analyst. Extract structured data about this brand from the provided web content.

Brand URL: ${resolvedUrl || "unknown"}
Brand Name hint: ${name ?? "unknown"}
Page content: ${pageText || "(no page content available)"}

Return a JSON object with these fields:
- name: string (brand name)
- country: string (brand's home country, ISO or full name)
- category: string (main fashion category: e.g. "Womenswear RTW", "Fine Jewelry", "Outdoor", "Menswear", "Accessories", "Luxury", "Childrenswear", "Sportswear")
- productTags: string[] (3-5 specific product keywords)
- revenueMUsd: number | null (estimated annual revenue in USD millions, or null)
- headcount: number | null (estimated employee count, or null)
- intlPresence: string (e.g. "Europe, USA" or "France only" or null)
- sustainable: boolean (true if brand emphasizes sustainability/ethics)
- positioning: string (e.g. "accessible_premium", "luxury", "mid_market", "mass_market")
- existingMarketplaces: string[] (known marketplace presences: Zalando, Amazon, ASOS, etc.)
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
            }
          } catch (err) {
            sse(controller, "progress", { step: "llm", message: `LLM extraction failed: ${err instanceof Error ? err.message : "unknown"}` });
          }
        } else {
          sse(controller, "progress", { step: "llm", message: "No LLM API key configured — using basic extraction" });
          // Fallback: extract name from URL
          if (!brandData.name && resolvedUrl) {
            const urlObj = new URL(resolvedUrl.startsWith("http") ? resolvedUrl : `https://${resolvedUrl}`);
            brandData.name = urlObj.hostname.replace(/^www\./, "").split(".")[0];
          }
        }

        sse(controller, "progress", { step: "score", message: "Computing marketplace scores…" });

        // Step 3: Compute scores with default weights
        const marketplaces = await prisma.marketplace.findMany();
        const scores = marketplaces.map((mp) => {
          // Heuristic scoring for new brands (no historical data)
          const fitCategory = estimateFitCategory(String(brandData.category ?? ""), mp.targetCategories);
          const fitGeo = estimateFitGeo(String(brandData.country ?? ""), String(brandData.intlPresence ?? ""), mp.winningGeos);
          const commercialScale = estimateScale(Number(brandData.revenueMUsd) || 0, Number(brandData.headcount) || 0);
          const opsReadiness = 5; // default mid
          const fitPositioning = estimatePositioning(String(brandData.positioning ?? ""), mp.role ?? "");
          const incrementality = 5;
          const sustainabilityStory = brandData.sustainable ? 8 : 4;

          const score = computeScore(
            {
              fitCategory,
              fitGeo,
              commercialScale,
              opsReadiness,
              fitPositioning,
              incrementality,
              sustainabilityStory,
              baseCompletion: 3, // lower for manual entry (less data)
              penalty: 0,
              initialPrior: 0,
            },
            BALANCED_WEIGHTS
          );

          return {
            marketplaceId: mp.id,
            marketplaceName: mp.name,
            score,
            priority: priorityFromScore(score),
            fitCategory,
            fitGeo,
            commercialScale,
            opsReadiness,
            fitPositioning,
            incrementality,
            sustainabilityStory,
          };
        });

        scores.sort((a, b) => b.score - a.score);

        sse(controller, "progress", { step: "done", message: "Enrichment complete" });
        sse(controller, "result", { brand: brandData, scores });

      } catch (err) {
        sse(controller, "error", { message: err instanceof Error ? err.message : "Unknown error" });
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

function estimateFitCategory(category: string, targetCategoriesJson: string): number {
  const targets = JSON.parse(targetCategoriesJson || "[]") as string[];
  if (!category || targets.length === 0) return 5;
  const cat = category.toLowerCase();
  for (const t of targets) {
    const tl = t.toLowerCase();
    if (cat.includes(tl) || tl.includes(cat)) return 9;
  }
  return 4;
}

function estimateFitGeo(country: string, intl: string, winningGeosJson: string): number {
  const geos = JSON.parse(winningGeosJson || "[]") as string[];
  const combined = `${country} ${intl}`.toLowerCase();
  if (geos.length === 0) return 5;
  for (const g of geos) {
    if (combined.includes(g.toLowerCase())) return 9;
  }
  return 4;
}

function estimateScale(revenueMUsd: number, headcount: number): number {
  if (revenueMUsd > 50 || headcount > 500) return 9;
  if (revenueMUsd > 20 || headcount > 200) return 7;
  if (revenueMUsd > 5 || headcount > 50) return 5;
  return 3;
}

function estimatePositioning(positioning: string, mpRole: string): number {
  const pos = positioning.toLowerCase();
  const role = mpRole.toLowerCase();
  if ((pos.includes("premium") || pos.includes("luxury")) && role.includes("premium")) return 9;
  if (pos.includes("mass") && role.includes("mass")) return 8;
  if (pos.includes("mid") && !role.includes("luxury")) return 7;
  return 5;
}
