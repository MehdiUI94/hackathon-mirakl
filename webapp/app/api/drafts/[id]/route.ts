import { prisma } from "@/lib/db";
import {
  getFallbackDraft,
  updateFallbackDraft,
  useNetlifyDraftStore,
} from "@/lib/netlify-draft-store";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (useNetlifyDraftStore()) {
    const draft = await getFallbackDraft(id);
    if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(draft);
  }
  const draft = await prisma.emailDraft.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(draft);
}

const PatchSchema = z.object({
  subject: z.string().min(1).optional(),
  bodyText: z.string().min(1).optional(),
  toEmail: z.email().optional(),
  toFirstName: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (useNetlifyDraftStore()) {
    const draft = await getFallbackDraft(id);
    if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (draft.status !== "PENDING" && draft.status !== "EDITED") {
      return NextResponse.json({ error: "Aperçu déjà décidé, modification impossible" }, { status: 409 });
    }
    const updated = await updateFallbackDraft(id, { ...parsed.data, status: "EDITED", edited: true });
    return NextResponse.json(updated);
  }
  const draft = await prisma.emailDraft.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (draft.status !== "PENDING" && draft.status !== "EDITED") {
    return NextResponse.json({ error: "Aperçu déjà décidé, modification impossible" }, { status: 409 });
  }
  const updated = await prisma.emailDraft.update({
    where: { id },
    data: { ...parsed.data, status: "EDITED", edited: true },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (useNetlifyDraftStore()) {
    const draft = await getFallbackDraft(id);
    if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (draft.callbackUrl) {
      notifyN8n(draft.callbackUrl, {
        event: "preview.discarded",
        draftId: draft.id,
        n8nExecutionId: draft.n8nExecutionId,
      }).catch(() => {});
    }
    await updateFallbackDraft(id, { status: "DISCARDED", decidedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  }
  const draft = await prisma.emailDraft.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Notify n8n callback if present (fire and forget)
  if (draft.callbackUrl) {
    notifyN8n(draft.callbackUrl, {
      event: "preview.discarded",
      draftId: draft.id,
      n8nExecutionId: draft.n8nExecutionId,
    }).catch(() => {});
  }

  await prisma.emailDraft.update({
    where: { id },
    data: { status: "DISCARDED", decidedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

async function notifyN8n(url: string, payload: Record<string, unknown>) {
  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings?.n8nWebhookSecret) {
    headers["X-Webhook-Secret"] = settings.n8nWebhookSecret;
  }
  await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
}
