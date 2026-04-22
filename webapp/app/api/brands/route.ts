import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { scoreBrandAgainstMarketplaces } from "@/lib/scoring";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? "";
  const country = searchParams.get("country") ?? "";
  const priority = searchParams.get("priority") ?? "";
  const take = Math.min(parseInt(searchParams.get("take") ?? "50"), 200);
  const skip = parseInt(searchParams.get("skip") ?? "0");

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
        orderBy: { finalScore: "desc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
    take,
    skip,
  });

  const filtered = priority
    ? brands.filter((b) =>
        b.scoringLines[0]?.priority?.startsWith(priority) ?? false
      )
    : brands;

  return NextResponse.json(
    filtered.map((b) => ({
      id: b.id,
      name: b.name,
      url: b.url,
      country: b.country,
      category: b.category,
      sourceGroup: b.sourceGroup,
      bestScore: b.scoringLines[0]?.finalScore ?? null,
      bestPriority: b.scoringLines[0]?.priority ?? null,
      topMarketplace: b.recommendations[0]?.marketplace.name ?? null,
      createdVia: b.createdVia,
    }))
  );
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
