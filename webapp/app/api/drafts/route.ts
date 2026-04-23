import { prisma } from "@/lib/db";
import { countFallbackDrafts, listFallbackDrafts, useNetlifyDraftStore } from "@/lib/netlify-draft-store";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") ?? "";
  const campaign = req.nextUrl.searchParams.get("campaign") ?? "";
  const q = req.nextUrl.searchParams.get("q") ?? "";

  if (useNetlifyDraftStore()) {
    const drafts = await listFallbackDrafts({ status, campaign, q });
    return NextResponse.json({ drafts, counts: await countFallbackDrafts() });
  }

  const drafts = await prisma.emailDraft.findMany({
    where: {
      AND: [
        status ? { status } : {},
        campaign ? { campaign } : {},
        q
          ? {
              OR: [
                { brandName: { contains: q } },
                { toEmail: { contains: q } },
                { subject: { contains: q } },
              ],
            }
          : {},
      ],
    },
    orderBy: [{ status: "asc" }, { receivedAt: "desc" }],
    take: 200,
  });

  // Counts for KPI strip
  const counts = await prisma.emailDraft.groupBy({
    by: ["status"],
    _count: true,
  });
  const byStatus: Record<string, number> = {};
  for (const c of counts) byStatus[c.status] = c._count;

  return NextResponse.json({ drafts, counts: byStatus });
}
