import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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

  // Filter by priority after fetch (computed field on scoring line)
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
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = CreateBrandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const brand = await prisma.brand.create({
    data: {
      ...parsed.data,
      createdVia: "MANUAL",
      sourceGroup: "MAIN",
    },
  });
  return NextResponse.json(brand, { status: 201 });
}
