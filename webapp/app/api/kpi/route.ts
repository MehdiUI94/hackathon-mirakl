import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const [brands, marketplaces, targets, emailsSent, meetings] = await Promise.all([
    prisma.brand.count(),
    prisma.marketplace.count(),
    prisma.campaignTarget.count({ where: { stopped: false } }),
    prisma.emailSend.count({ where: { status: "SENT" } }),
    prisma.emailSend.count({ where: { meetingBooked: true } }),
  ]);

  const replies = await prisma.emailSend.count({ where: { replyAt: { not: null } } });

  const replyRate = emailsSent > 0 ? Math.round((replies / emailsSent) * 1000) / 10 : 0;

  // Top P1 brands by best scoring line
  const topBrands = await prisma.scoringLine.findMany({
    where: { priority: { startsWith: "P1" }, alreadyPresent: false },
    orderBy: { finalScore: "desc" },
    take: 8,
    include: { brand: true, marketplace: true },
    distinct: ["brandId"],
  });

  const recentSends = await prisma.emailSend.findMany({
    where: { sentAt: { not: null } },
    orderBy: { sentAt: "desc" },
    take: 10,
    include: {
      emailTemplate: {
        include: {
          campaignTarget: {
            include: { brand: true, marketplace: true },
          },
        },
      },
    },
  });

  return NextResponse.json({
    brands,
    marketplaces,
    targets,
    emailsSent,
    meetings,
    replyRate,
    topBrands: topBrands.map((sl) => ({
      id: sl.brand.id,
      name: sl.brand.name,
      marketplace: sl.marketplace.name,
      score: sl.finalScore,
      priority: sl.priority,
    })),
    recentActivity: recentSends.map((s) => ({
      id: s.id,
      brand: s.emailTemplate.campaignTarget.brand.name,
      marketplace: s.emailTemplate.campaignTarget.marketplace.name,
      subject: s.renderedSubject,
      sentAt: s.sentAt,
      status: s.status,
      replyType: s.replyType,
    })),
  });
}
