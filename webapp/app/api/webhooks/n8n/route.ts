import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const EventSchema = z.object({
  event: z.enum([
    "email.sent",
    "email.opened",
    "email.replied",
    "email.bounced",
    "email.unsubscribed",
    "meeting.booked",
  ]),
  emailSendId: z.string(),
  n8nExecutionId: z.string().optional(),
  occurredAt: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const STOP_EVENTS = new Set([
  "email.replied",
  "email.bounced",
  "email.unsubscribed",
  "meeting.booked",
]);

export async function POST(req: NextRequest) {
  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });

  if (settings?.n8nWebhookSecret) {
    const incoming =
      req.headers.get("x-webhook-secret") ?? req.headers.get("X-Webhook-Secret") ?? "";
    if (incoming !== settings.n8nWebhookSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const parsed = EventSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { event, emailSendId, n8nExecutionId, occurredAt, data } = parsed.data;
  const ts = occurredAt ? new Date(occurredAt) : new Date();

  const send = await prisma.emailSend.findUnique({
    where: { id: emailSendId },
    include: { emailTemplate: true },
  });
  if (!send) {
    return NextResponse.json({ error: "EmailSend not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  if (n8nExecutionId) update.n8nExecutionId = n8nExecutionId;

  switch (event) {
    case "email.sent":
      update.status = "SENT";
      update.sentAt = ts;
      break;
    case "email.opened":
      if (send.status !== "REPLIED") update.status = "OPENED";
      break;
    case "email.replied":
      update.status = "REPLIED";
      update.replyAt = ts;
      update.replyType = String(data?.replyType ?? "POSITIVE");
      break;
    case "email.bounced":
      update.status = "BOUNCED";
      break;
    case "email.unsubscribed":
      update.status = "STOPPED";
      update.replyType = "UNSUBSCRIBE";
      update.replyAt = ts;
      break;
    case "meeting.booked":
      update.status = "REPLIED";
      update.meetingBooked = true;
      update.replyType = "MEETING";
      update.replyAt = ts;
      break;
  }

  await prisma.emailSend.update({ where: { id: emailSendId }, data: update });

  if (STOP_EVENTS.has(event)) {
    await prisma.campaignTarget.update({
      where: { id: send.emailTemplate.campaignTargetId },
      data: event === "email.unsubscribed" ? { stopped: true } : { paused: true },
    });
  }

  return NextResponse.json({ received: true, event, emailSendId });
}
