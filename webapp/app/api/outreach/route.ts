import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const Schema = z.object({
  brandId: z.string(),
  marketplaceId: z.string(),
  emailTemplateId: z.string().optional(),
  toEmail: z.string().email(),
  toFirstName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { brandId, marketplaceId, emailTemplateId, toEmail, toFirstName } = parsed.data;

  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  if (!settings?.n8nWebhookUrl) {
    return NextResponse.json({ error: "n8n webhook URL not configured in Settings" }, { status: 422 });
  }

  // Find the campaign target and email template
  const target = await prisma.campaignTarget.findFirst({
    where: { brandId, marketplaceId },
    include: {
      brand: true,
      marketplace: true,
      emailTemplates: {
        where: emailTemplateId ? { id: emailTemplateId } : { step: 1 },
        orderBy: { step: "asc" },
        take: 1,
      },
    },
  });

  if (!target || target.emailTemplates.length === 0) {
    return NextResponse.json({ error: "No email template found" }, { status: 404 });
  }

  const template = target.emailTemplates[0];

  // Simple variable substitution
  const firstName = toFirstName ?? "there";
  const subject = template.subject
    .replace(/{{first_name}}/gi, firstName)
    .replace(/{{marketplace}}/gi, target.marketplace.name)
    .replace(/{{brand}}/gi, target.brand.name);
  const body2 = template.bodyText
    .replace(/{{first_name}}/gi, firstName)
    .replace(/{{marketplace}}/gi, target.marketplace.name)
    .replace(/{{brand}}/gi, target.brand.name);

  // Create EmailSend record
  const send = await prisma.emailSend.create({
    data: {
      emailTemplateId: template.id,
      toEmail,
      toFirstName: toFirstName ?? undefined,
      renderedSubject: subject,
      renderedBody: body2,
      status: "QUEUED",
    },
  });

  // Post to n8n
  const payload = {
    sendId: send.id,
    brandId,
    marketplaceId,
    brandName: target.brand.name,
    marketplaceName: target.marketplace.name,
    toEmail,
    toFirstName: firstName,
    subject,
    bodyText: body2,
    campaign: target.campaign,
    step: template.step,
  };

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (settings.n8nWebhookSecret) {
      headers["x-webhook-secret"] = settings.n8nWebhookSecret;
    }

    const res = await fetch(settings.n8nWebhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      await prisma.emailSend.update({
        where: { id: send.id },
        data: { status: "FAILED" },
      });
      return NextResponse.json({ error: "n8n webhook failed", status: res.status }, { status: 502 });
    }

    const n8nData = await res.json().catch(() => ({})) as Record<string, unknown>;
    await prisma.emailSend.update({
      where: { id: send.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        n8nExecutionId: String(n8nData.executionId ?? ""),
      },
    });

    return NextResponse.json({ success: true, sendId: send.id });
  } catch (err) {
    await prisma.emailSend.update({
      where: { id: send.id },
      data: { status: "FAILED" },
    });
    console.error("n8n webhook error:", err);
    return NextResponse.json({ error: "Network error sending to n8n" }, { status: 502 });
  }
}
