import { prisma } from "@/lib/db";
import { computeBrandPreview } from "@/lib/brand-activation";
import { NextRequest } from "next/server";
import * as cheerio from "cheerio";
import Anthropic from "@anthropic-ai/sdk";

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

        if (apiKey && apiKey !== "***") {
          try {
            const client = new Anthropic({ apiKey });
            const prompt = `You are a fashion industry analyst. Extract structured data about this brand from the provided web content.

Brand URL: ${resolvedUrl || "unknown"}
Brand Name hint: ${name ?? "unknown"}
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

        sse(controller, "progress", { step: "score", message: "Computing marketplace scores with benchmark…" });
        const preview = await computeBrandPreview({
          ...brandData,
          url: resolvedUrl || String(brandData.url ?? ""),
          name: String(brandData.name ?? name ?? resolvedUrl ?? ""),
          createdVia: "ENRICHED",
        });

        sse(controller, "progress", { step: "done", message: "Enrichment complete" });
        sse(controller, "result", { brand: preview.brand, scores: preview.scores });

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
