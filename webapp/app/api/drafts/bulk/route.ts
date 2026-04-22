import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const Schema = z.object({
  ids: z.array(z.string()).min(1).max(100),
  action: z.enum(["approve", "discard"]),
});

export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { ids, action } = parsed.data;

  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  const drafts = await prisma.emailDraft.findMany({ where: { id: { in: ids } } });

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const draft of drafts) {
    if (draft.status !== "PENDING" && draft.status !== "EDITED") {
      results.push({ id: draft.id, ok: false, error: "Déjà décidé" });
      continue;
    }

    if (action === "discard") {
      if (draft.callbackUrl) {
        notify(draft.callbackUrl, settings?.n8nWebhookSecret, {
          event: "preview.discarded",
          draftId: draft.id,
          n8nExecutionId: draft.n8nExecutionId,
        }).catch(() => {});
      }
      await prisma.emailDraft.update({
        where: { id: draft.id },
        data: { status: "DISCARDED", decidedAt: new Date() },
      });
      results.push({ id: draft.id, ok: true });
      continue;
    }

    // action === "approve"
    const targetUrl = draft.callbackUrl ?? settings?.n8nWebhookUrl;
    if (!targetUrl) {
      await prisma.emailDraft.update({
        where: { id: draft.id },
        data: { status: "FAILED", errorMessage: "Aucune URL n8n configurée" },
      });
      results.push({ id: draft.id, ok: false, error: "Aucune URL n8n" });
      continue;
    }

    const payload = {
      event: "preview.approved",
      draftId: draft.id,
      n8nExecutionId: draft.n8nExecutionId,
      to: { email: draft.toEmail, firstName: draft.toFirstName },
      subject: draft.subject,
      bodyText: draft.bodyText,
      edited: draft.edited,
      brand: { id: draft.brandId, name: draft.brandName },
      marketplace: { id: draft.marketplaceId, name: draft.marketplaceName },
      campaign: draft.campaign,
      step: draft.step,
      branch: draft.branch,
      sender: settings
        ? { firstName: settings.defaultSenderName, email: settings.defaultSenderEmail }
        : null,
    };

    try {
      const res = await notify(targetUrl, settings?.n8nWebhookSecret, payload);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        await prisma.emailDraft.update({
          where: { id: draft.id },
          data: { status: "FAILED", errorMessage: `HTTP ${res.status} ${text.slice(0, 200)}` },
        });
        results.push({ id: draft.id, ok: false, error: `HTTP ${res.status}` });
      } else {
        await prisma.emailDraft.update({
          where: { id: draft.id },
          data: { status: "SENT", decidedAt: new Date(), sentAt: new Date() },
        });
        results.push({ id: draft.id, ok: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur réseau";
      await prisma.emailDraft.update({
        where: { id: draft.id },
        data: { status: "FAILED", errorMessage: msg },
      });
      results.push({ id: draft.id, ok: false, error: msg });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({ total: results.length, ok: okCount, results });
}

async function notify(url: string, secret: string | null | undefined, payload: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["X-Webhook-Secret"] = secret;
  return fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
}
