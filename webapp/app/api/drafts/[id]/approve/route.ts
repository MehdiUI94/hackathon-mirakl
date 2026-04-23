import { prisma } from "@/lib/db";
import {
  getFallbackDraft,
  updateFallbackDraft,
  useNetlifyDraftStore,
} from "@/lib/netlify-draft-store";
import { NextRequest, NextResponse } from "next/server";

/**
 * Approve a draft and trigger the actual send.
 * Posts the final subject/body back to the n8n callbackUrl that came in
 * with the preview. If no callbackUrl is present, falls back to the
 * generic n8nWebhookUrl from Settings.
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (useNetlifyDraftStore()) {
    const draft = await getFallbackDraft(id);
    if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (draft.status === "SENT") {
      return NextResponse.json({ error: "Déjà envoyé" }, { status: 409 });
    }
    if (draft.status === "DISCARDED") {
      return NextResponse.json({ error: "Aperçu refusé, envoi impossible" }, { status: 409 });
    }

    const targetUrl = draft.callbackUrl;
    if (!targetUrl) {
      return NextResponse.json(
        { error: "Aucune URL n8n configurée pour ce draft." },
        { status: 422 }
      );
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
      sender: null,
    };

    try {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        await updateFallbackDraft(id, {
          status: "FAILED",
          errorMessage: `HTTP ${res.status} ${text.slice(0, 200)}`,
        });
        return NextResponse.json(
          { error: "Échec de l'envoi à n8n", status: res.status },
          { status: 502 }
        );
      }
      const updated = await updateFallbackDraft(id, {
        status: "SENT",
        decidedAt: new Date().toISOString(),
        sentAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, draft: updated });
    } catch (err) {
      await updateFallbackDraft(id, {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "Erreur réseau inconnue",
      });
      return NextResponse.json(
        { error: "Erreur réseau lors de l'envoi à n8n" },
        { status: 502 }
      );
    }
  }
  const draft = await prisma.emailDraft.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (draft.status === "SENT") {
    return NextResponse.json({ error: "Déjà envoyé" }, { status: 409 });
  }
  if (draft.status === "DISCARDED") {
    return NextResponse.json({ error: "Aperçu refusé, envoi impossible" }, { status: 409 });
  }

  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  const targetUrl = draft.callbackUrl ?? settings?.n8nWebhookUrl;
  if (!targetUrl) {
    return NextResponse.json(
      { error: "Aucune URL n8n configurée. Renseignez l'URL du webhook dans les Réglages." },
      { status: 422 }
    );
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

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings?.n8nWebhookSecret) {
    headers["X-Webhook-Secret"] = settings.n8nWebhookSecret;
  }

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      await prisma.emailDraft.update({
        where: { id },
        data: { status: "FAILED", errorMessage: `HTTP ${res.status} ${text.slice(0, 200)}` },
      });
      return NextResponse.json(
        { error: "Échec de l'envoi à n8n", status: res.status },
        { status: 502 }
      );
    }
    const updated = await prisma.emailDraft.update({
      where: { id },
      data: {
        status: "SENT",
        decidedAt: new Date(),
        sentAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, draft: updated });
  } catch (err) {
    await prisma.emailDraft.update({
      where: { id },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "Erreur réseau inconnue",
      },
    });
    return NextResponse.json(
      { error: "Erreur réseau lors de l'envoi à n8n" },
      { status: 502 }
    );
  }
}
