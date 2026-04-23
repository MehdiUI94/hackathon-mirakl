import { prisma } from "@/lib/db";
import { createFallbackDraft, useNetlifyDraftStore } from "@/lib/netlify-draft-store";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Inbound from n8n: an email PREVIEW awaiting human validation.
 * The operator will review/edit/approve from the Inbox UI; on approval
 * the app will POST back to `callbackUrl` with the final subject/body.
 */
const CanonicalPreviewSchema = z.object({
  brandId: z.string().optional(),
  marketplaceId: z.string().optional(),
  brandName: z.string().optional(),
  marketplaceName: z.string().optional(),
  campaign: z.string().optional(),
  step: z.number().int().min(1).max(10).default(1),
  branch: z.string().optional(),
  to: z.object({
    email: z.email(),
    firstName: z.string().optional(),
  }),
  subject: z.string().min(1),
  bodyText: z.string().min(1),
  cta: z.string().optional(),
  stopRule: z.string().optional(),
  claimSources: z.array(z.string()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  sender: z
    .object({
      email: z.string().optional(),
      firstName: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  callbackUrl: z.url().optional(),
  n8nExecutionId: z.string().optional(),
});

const PreviewSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") return raw;

  const input = raw as Record<string, unknown>;
  const output =
    input.output && typeof input.output === "object"
      ? (input.output as Record<string, unknown>)
      : null;
  const to =
    input.to && typeof input.to === "object"
      ? (input.to as Record<string, unknown>)
      : null;

  const subject =
    asNonEmptyString(input.subject) ??
    asNonEmptyString(input.subjectLine) ??
    asNonEmptyString(input.subject_line) ??
    asNonEmptyString(output?.subject) ??
    asNonEmptyString(output?.subjectLine) ??
    asNonEmptyString(output?.subject_line);

  const bodyText =
    asNonEmptyString(input.bodyText) ??
    asNonEmptyString(input.body) ??
    asNonEmptyString(output?.bodyText) ??
    asNonEmptyString(output?.body);

  const sender =
    input.sender && typeof input.sender === "object"
      ? (input.sender as Record<string, unknown>)
      : null;

  const firstName =
    asNonEmptyString(to?.firstName) ??
    asNonEmptyString(to?.first_name) ??
    asNonEmptyString(input.toFirstName) ??
    asNonEmptyString(input.firstName) ??
    asNonEmptyString(input.first_name);

  return {
    ...input,
    to: {
      email:
        asNonEmptyString(to?.email) ??
        asNonEmptyString(input.toEmail) ??
        asNonEmptyString(input.to_email),
      firstName,
    },
    subject,
    bodyText,
    sender: sender
      ? {
          email: asNonEmptyString(sender.email),
          firstName:
            asNonEmptyString(sender.firstName) ??
            asNonEmptyString(sender.first_name) ??
            asNonEmptyString(sender.name),
          name: asNonEmptyString(sender.name),
        }
      : undefined,
    meta: {
      ...(input.meta && typeof input.meta === "object"
        ? (input.meta as Record<string, unknown>)
        : {}),
      ...(input.conversationUrl ? { conversationUrl: input.conversationUrl } : {}),
      ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
      ...(input.executionMode ? { executionMode: input.executionMode } : {}),
      ...(input.amazonNotZalando !== undefined
        ? { amazonNotZalando: input.amazonNotZalando }
        : {}),
    },
  };
}, CanonicalPreviewSchema);

export async function POST(req: NextRequest) {
  let fallbackPreview: z.infer<typeof CanonicalPreviewSchema> | null = null;
  try {
    const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
    if (settings?.n8nWebhookSecret) {
      const incoming = req.headers.get("x-webhook-secret") ?? "";
      if (incoming !== settings.n8nWebhookSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const parsed = PreviewSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const p = parsed.data;
    fallbackPreview = p;
    const subject = interpolatePreviewTemplate(p.subject, p);
    const bodyText = interpolatePreviewTemplate(p.bodyText, p);

    let brand = null;
    if (p.brandId) brand = await prisma.brand.findUnique({ where: { id: p.brandId } });
    if (!brand && p.brandName) {
      brand = await prisma.brand.findFirst({ where: { name: { contains: p.brandName } } });
    }

    let marketplace = null;
    if (p.marketplaceId) marketplace = await prisma.marketplace.findUnique({ where: { id: p.marketplaceId } });
    if (!marketplace && p.marketplaceName) {
      marketplace = await prisma.marketplace.findFirst({ where: { name: p.marketplaceName } });
    }

    const draft = await prisma.emailDraft.create({
      data: {
        brandId: brand?.id ?? null,
        marketplaceId: marketplace?.id ?? null,
        brandName: brand?.name ?? p.brandName ?? "Marque inconnue",
        marketplaceName: marketplace?.name ?? p.marketplaceName ?? "Marketplace inconnue",
        campaign: p.campaign ?? null,
        step: p.step,
        branch: p.branch ?? null,
        toEmail: p.to.email,
        toFirstName: p.to.firstName ?? null,
        subject,
        bodyText,
        cta: p.cta ?? null,
        stopRule: p.stopRule ?? null,
        claimSources: JSON.stringify(p.claimSources ?? []),
        meta: JSON.stringify(p.meta ?? {}),
        callbackUrl: p.callbackUrl ?? null,
        n8nExecutionId: p.n8nExecutionId ?? null,
        status: "PENDING",
      },
    });

    return NextResponse.json({ id: draft.id, status: draft.status }, { status: 201 });
  } catch (error) {
    if (useNetlifyDraftStore() && fallbackPreview) {
      const p = fallbackPreview;
        const subject = interpolatePreviewTemplate(p.subject, p);
        const bodyText = interpolatePreviewTemplate(p.bodyText, p);
        const draft = await createFallbackDraft({
          brandId: null,
          marketplaceId: null,
          brandName: p.brandName ?? "Marque inconnue",
          marketplaceName: p.marketplaceName ?? "Marketplace inconnue",
          campaign: p.campaign ?? null,
          step: p.step,
          branch: p.branch ?? null,
          toEmail: p.to.email,
          toFirstName: p.to.firstName ?? null,
          subject,
          bodyText,
          cta: p.cta ?? null,
          stopRule: p.stopRule ?? null,
          claimSources: JSON.stringify(p.claimSources ?? []),
          meta: JSON.stringify(p.meta ?? {}),
          callbackUrl: p.callbackUrl ?? null,
          n8nExecutionId: p.n8nExecutionId ?? null,
          status: "PENDING",
          edited: false,
        });
        return NextResponse.json({ id: draft.id, status: draft.status, fallback: true }, { status: 201 });
    }

    const message = error instanceof Error ? error.message : "Unknown preview webhook error";
    return NextResponse.json(
      {
        error: "Preview creation failed",
        detail: message,
      },
      { status: 500 }
    );
  }
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function interpolatePreviewTemplate(
  template: string,
  preview: z.infer<typeof CanonicalPreviewSchema>
) {
  const replacements: Array<[RegExp, string]> = [
    [/\{\{\s*brand_name\s*\}\}|\{brand_name\}/gi, preview.brandName ?? ""],
    [/\{\{\s*marketplace_name\s*\}\}|\{marketplace_name\}/gi, preview.marketplaceName ?? ""],
    [/\{\{\s*first_name\s*\}\}|\{first_name\}/gi, preview.to.firstName ?? ""],
    [/\{\{\s*sender\.first_name\s*\}\}|\{sender\.first_name\}/gi, preview.sender?.firstName ?? ""],
    [/\{\{\s*sender\.firstName\s*\}\}|\{sender\.firstName\}/gi, preview.sender?.firstName ?? ""],
    [/\{\{\s*sender\.email\s*\}\}|\{sender\.email\}/gi, preview.sender?.email ?? ""],
    [/\{\{\s*operator_name\s*\}\}|\{operator_name\}/gi, preview.marketplaceName ?? ""],
  ];

  return replacements.reduce(
    (value, [pattern, replacement]) => value.replace(pattern, replacement),
    template
  );
}
