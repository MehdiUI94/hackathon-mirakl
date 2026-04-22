import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const Schema = z.object({
  brandId: z.string(),
  marketplaceId: z.string(),
  emailTemplateId: z.string().optional(),
  toEmail: z.email(),
  toFirstName: z.string().optional(),
  // Edited content from the UI — overrides template when present
  subject: z.string().optional(),
  bodyText: z.string().optional(),
  // Metadata for n8n consumers
  scoringProfile: z.string().optional(),
  finalScore: z.number().optional(),
  priority: z.string().optional(),
  branch: z.enum(["Launch", "Accelerate"]).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  if (!settings?.n8nWebhookUrl) {
    return NextResponse.json(
      { error: "n8n webhook URL not configured in Settings" },
      { status: 422 }
    );
  }

  const target = await prisma.campaignTarget.findFirst({
    where: { brandId: input.brandId, marketplaceId: input.marketplaceId },
    include: {
      brand: true,
      marketplace: true,
      emailTemplates: {
        where: input.emailTemplateId ? { id: input.emailTemplateId } : { step: 1 },
        orderBy: { step: "asc" },
        take: 1,
      },
    },
  });

  if (!target || target.emailTemplates.length === 0) {
    return NextResponse.json({ error: "No email template found" }, { status: 404 });
  }

  const targetSafe = target;
  const template = targetSafe.emailTemplates[0];
  const firstName = input.toFirstName ?? "there";

  function applyTokens(text: string) {
    return text
      .replace(/{{\s*first_name\s*}}/gi, firstName)
      .replace(/{{\s*email\s*}}/gi, input.toEmail)
      .replace(/{{\s*marketplace\s*}}/gi, targetSafe.marketplace.name)
      .replace(/{{\s*brand\s*}}/gi, targetSafe.brand.name)
      .replace(/{{\s*sender\.first_name\s*}}/gi, settings?.defaultSenderName ?? "");
  }

  const subject = applyTokens(input.subject ?? template.subject);
  const bodyText = applyTokens(input.bodyText ?? template.bodyText);
  const claimSources = JSON.parse(template.claimSources || "[]") as string[];

  const send = await prisma.emailSend.create({
    data: {
      emailTemplateId: template.id,
      toEmail: input.toEmail,
      toFirstName: input.toFirstName ?? undefined,
      renderedSubject: subject,
      renderedBody: bodyText,
      status: "QUEUED",
    },
  });

  const payload = {
    event: "email.send.requested" as const,
    campaign: targetSafe.campaign,
    brandId: input.brandId,
    marketplaceId: input.marketplaceId,
    emailTemplateId: template.id,
    emailSendId: send.id,
    step: template.step,
    branch: input.branch ?? template.branch ?? null,
    to: { email: input.toEmail, firstName: firstName },
    sender: {
      firstName: settings.defaultSenderName ?? "",
      email: settings.defaultSenderEmail ?? "",
    },
    subject,
    bodyText,
    claimSources,
    stopRule: template.stopRule ?? "",
    meta: {
      scoringProfile: input.scoringProfile ?? "Balanced",
      finalScore: input.finalScore ?? targetSafe.topScore ?? 0,
      priority: input.priority ?? targetSafe.priority ?? "",
    },
  };

  await prisma.emailSend.update({
    where: { id: send.id },
    data: { webhookPayload: JSON.stringify(payload) },
  });

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (settings.n8nWebhookSecret) {
      headers["X-Webhook-Secret"] = settings.n8nWebhookSecret;
    }
    const res = await fetch(settings.n8nWebhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      await prisma.emailSend.update({ where: { id: send.id }, data: { status: "FAILED" } });
      return NextResponse.json(
        { error: "n8n webhook failed", status: res.status },
        { status: 502 }
      );
    }

    const n8nData = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    await prisma.emailSend.update({
      where: { id: send.id },
      data: {
        status: "QUEUED",
        n8nExecutionId: n8nData.executionId ? String(n8nData.executionId) : null,
      },
    });

    return NextResponse.json({ success: true, sendId: send.id });
  } catch (err) {
    await prisma.emailSend.update({ where: { id: send.id }, data: { status: "FAILED" } });
    console.error("n8n webhook error:", err);
    return NextResponse.json({ error: "Network error sending to n8n" }, { status: 502 });
  }
}
