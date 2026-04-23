import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const brand = await prisma.brand.findUnique({
    where: { id },
    include: {
      scoringLines: {
        include: { marketplace: true },
        orderBy: { finalScore: "desc" },
      },
      recommendations: {
        orderBy: { rank: "asc" },
        include: { marketplace: true },
      },
      campaignTargets: {
        include: {
          marketplace: true,
          emailTemplates: {
            orderBy: { step: "asc" },
            take: 5,
          },
        },
      },
    },
  });

  if (!brand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...brand,
    businessSignals: JSON.parse(brand.businessSignals || "[]"),
    productTags: JSON.parse(brand.productTags || "[]"),
    existingMarketplaces: JSON.parse(brand.existingMarketplaces || "[]"),
  });
}
