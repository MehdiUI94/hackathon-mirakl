import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const campaign = searchParams.get("campaign") ?? "";

  const targets = await prisma.campaignTarget.findMany({
    where: campaign ? { campaign } : {},
    include: {
      brand: true,
      marketplace: true,
      emailTemplates: {
        include: {
          emailSends: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { step: "asc" },
      },
    },
    orderBy: [{ campaign: "asc" }, { topScore: "desc" }],
  });

  const rows = targets.map((t) => {
    const allSends = t.emailTemplates.flatMap((et) => et.emailSends);
    const sent = allSends.filter((s) => s.status === "SENT").length;
    const replied = allSends.find((s) => s.replyAt != null);
    const lastSend = allSends.find((s) => s.sentAt != null);
    const maxStep = Math.max(0, ...allSends.filter((s) => s.status === "SENT").map(() => {
      const et = t.emailTemplates.find((et) => et.emailSends.some((s2) => s2 === lastSend));
      return et?.step ?? 0;
    }));

    return {
      id: t.id,
      brandId: t.brand.id,
      brandName: t.brand.name,
      marketplaceName: t.marketplace.name,
      campaign: t.campaign,
      topScore: t.topScore,
      priority: t.priority,
      paused: t.paused,
      stopped: t.stopped,
      emailsSent: sent,
      lastStep: maxStep,
      repliedAt: replied?.replyAt ?? null,
      replyType: replied?.replyType ?? null,
      meetingBooked: allSends.some((s) => s.meetingBooked),
      lastSentAt: lastSend?.sentAt ?? null,
    };
  });

  return NextResponse.json(rows);
}
