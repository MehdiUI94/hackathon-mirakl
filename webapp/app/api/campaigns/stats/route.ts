import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const campaign = req.nextUrl.searchParams.get("campaign") ?? "";

  const sends = await prisma.emailSend.findMany({
    where: campaign
      ? { emailTemplate: { campaignTarget: { campaign } } }
      : {},
    include: { emailTemplate: true },
  });

  // Per-step × status (stacked bar)
  const stepStatus: Record<number, Record<string, number>> = {};
  for (const s of sends) {
    const step = s.emailTemplate.step;
    stepStatus[step] = stepStatus[step] ?? {};
    stepStatus[step][s.status] = (stepStatus[step][s.status] ?? 0) + 1;
  }
  const steps = Object.keys(stepStatus)
    .map(Number)
    .sort((a, b) => a - b)
    .map((step) => ({
      step: `Step ${step}`,
      SENT: stepStatus[step].SENT ?? 0,
      OPENED: stepStatus[step].OPENED ?? 0,
      REPLIED: stepStatus[step].REPLIED ?? 0,
      BOUNCED: stepStatus[step].BOUNCED ?? 0,
      QUEUED: stepStatus[step].QUEUED ?? 0,
    }));

  // Last 30 days daily sends
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daily: { date: string; sent: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const count = sends.filter(
      (s) => s.sentAt && s.sentAt >= d && s.sentAt < next
    ).length;
    daily.push({ date: d.toISOString().slice(5, 10), sent: count });
  }

  // Funnel
  const sent = sends.filter((s) => s.sentAt != null).length;
  const opened = sends.filter((s) =>
    ["OPENED", "REPLIED"].includes(s.status) || s.replyAt != null
  ).length;
  const replied = sends.filter((s) => s.replyAt != null).length;
  const meetings = sends.filter((s) => s.meetingBooked).length;
  const funnel = [
    { stage: "Sent", value: sent },
    { stage: "Opened", value: opened },
    { stage: "Replied", value: replied },
    { stage: "Meeting", value: meetings },
  ];

  return NextResponse.json({ steps, daily, funnel });
}
