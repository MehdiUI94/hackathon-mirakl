import { prisma } from "@/lib/db";
import { canSendDirectEmail, sendDraftEmailDirect } from "@/lib/email-delivery";
import {
  getFallbackDraft,
  updateFallbackDraft,
  useNetlifyDraftStore,
} from "@/lib/netlify-draft-store";
import { NextRequest, NextResponse } from "next/server";

/**
 * Approve a draft and trigger the actual send.
 * If SMTP is configured, the app sends the email directly.
 * Otherwise it falls back to the historical n8n callback flow.
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
      return NextResponse.json({ error: "Deja envoye" }, { status: 409 });
    }
    if (draft.status === "DISCARDED") {
      return NextResponse.json({ error: "Apercu refuse, envoi impossible" }, { status: 409 });
    }

    if (canSendDirectEmail()) {
      try {
        await sendDraftEmailDirect(draft);
        const updated = await updateFallbackDraft(id, {
          status: "SENT",
          decidedAt: new Date().toISOString(),
          sentAt: new Date().toISOString(),
          errorMessage: null,
        });
        return NextResponse.json({ ok: true, draft: updated, delivery: "direct" });
      } catch (err) {
        await updateFallbackDraft(id, {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Erreur SMTP inconnue",
        });
        return NextResponse.json(
          { error: "Erreur lors de l'envoi direct du mail" },
          { status: 502 }
        );
      }
    }

    const targetUrl = draft.callbackUrl;
    if (!targetUrl) {
      return NextResponse.json(
        { error: "Aucun SMTP ni URL n8n configures pour ce draft." },
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
          { error: "Echec de l'envoi a n8n", status: res.status },
          { status: 502 }
        );
      }
      const updated = await updateFallbackDraft(id, {
        status: "SENT",
        decidedAt: new Date().toISOString(),
        sentAt: new Date().toISOString(),
        errorMessage: null,
      });
      return NextResponse.json({ ok: true, draft: updated, delivery: "n8n" });
    } catch (err) {
      await updateFallbackDraft(id, {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "Erreur reseau inconnue",
      });
      return NextResponse.json(
        { error: "Erreur reseau lors de l'envoi a n8n" },
        { status: 502 }
      );
    }
  }

  const draft = await prisma.emailDraft.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (draft.status === "SENT") {
    return NextResponse.json({ error: "Deja envoye" }, { status: 409 });
  }
  if (draft.status === "DISCARDED") {
    return NextResponse.json({ error: "Apercu refuse, envoi impossible" }, { status: 409 });
  }

  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });

  if (canSendDirectEmail()) {
    try {
      await sendDraftEmailDirect(draft, settings);
      const updated = await prisma.emailDraft.update({
        where: { id },
        data: {
          status: "SENT",
          decidedAt: new Date(),
          sentAt: new Date(),
          errorMessage: null,
        },
      });
      return NextResponse.json({ ok: true, draft: updated, delivery: "direct" });
    } catch (err) {
      await prisma.emailDraft.update({
        where: { id },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Erreur SMTP inconnue",
        },
      });
      return NextResponse.json(
        { error: "Erreur lors de l'envoi direct du mail" },
        { status: 502 }
      );
    }
  }

  const targetUrl = draft.callbackUrl ?? settings?.n8nWebhookUrl;
  if (!targetUrl) {
    return NextResponse.json(
      { error: "Aucun SMTP ni URL n8n configures. Configure le SMTP ou le webhook." },
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
        data: {
          status: "FAILED",
          errorMessage: `HTTP ${res.status} ${text.slice(0, 200)}`,
        },
      });
      return NextResponse.json(
        { error: "Echec de l'envoi a n8n", status: res.status },
        { status: 502 }
      );
    }
    const updated = await prisma.emailDraft.update({
      where: { id },
      data: {
        status: "SENT",
        decidedAt: new Date(),
        sentAt: new Date(),
        errorMessage: null,
      },
    });
    return NextResponse.json({ ok: true, draft: updated, delivery: "n8n" });
  } catch (err) {
    await prisma.emailDraft.update({
      where: { id },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "Erreur reseau inconnue",
      },
    });
    return NextResponse.json(
      { error: "Erreur reseau lors de l'envoi a n8n" },
      { status: 502 }
    );
  }
}
