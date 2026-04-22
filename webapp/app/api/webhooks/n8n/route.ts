import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });

  // Validate secret if configured
  if (settings?.n8nWebhookSecret) {
    const incomingSecret =
      req.headers.get("x-webhook-secret") ??
      req.headers.get("x-n8n-signature") ??
      "";
    if (incomingSecret !== settings.n8nWebhookSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json() as Record<string, unknown>;
  const sendId = String(body.sendId ?? "");
  if (!sendId) {
    return NextResponse.json({ error: "Missing sendId" }, { status: 400 });
  }

  const send = await prisma.emailSend.findUnique({ where: { id: sendId } });
  if (!send) {
    return NextResponse.json({ error: "EmailSend not found" }, { status: 404 });
  }

  const event = String(body.event ?? "");
  const updateData: Record<string, unknown> = {};

  if (event === "replied" || body.replyAt) {
    updateData.replyAt = body.replyAt ? new Date(String(body.replyAt)) : new Date();
    updateData.replyType = String(body.replyType ?? "POSITIVE");
    updateData.status = "REPLIED";
  }

  if (body.meetingBooked === true || String(body.event) === "meeting_booked") {
    updateData.meetingBooked = true;
    updateData.replyType = "MEETING";
    updateData.status = "REPLIED";
  }

  if (body.unsubscribed || body.replyType === "UNSUBSCRIBE") {
    updateData.replyType = "UNSUBSCRIBE";
    updateData.status = "REPLIED";
    // Pause the campaign target
    const template = await prisma.emailTemplate.findUnique({
      where: { id: send.emailTemplateId },
      include: { campaignTarget: true },
    });
    if (template) {
      await prisma.campaignTarget.update({
        where: { id: template.campaignTargetId },
        data: { paused: true },
      });
    }
  }

  if (event === "sent") {
    updateData.status = "SENT";
    updateData.sentAt = body.sentAt ? new Date(String(body.sentAt)) : new Date();
  }

  await prisma.emailSend.update({ where: { id: sendId }, data: updateData });

  return NextResponse.json({ received: true });
}
