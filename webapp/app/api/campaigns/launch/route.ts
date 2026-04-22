import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

const N8N_LAUNCH_WEBHOOK =
  "https://jbuyikana.app.n8n.cloud/webhook-test/a00ddf8f-cb36-4e98-a638-08a90ad8a00c";
const TEST_SENDER_EMAIL = "mzitouni@eugeniaschool.com";
const TEST_SENDER_NAME = "Mehdi";
const TEST_RECIPIENT_EMAIL = "zitounimehdi7@gmail.com";
const TEST_RECIPIENT_NAME = "Mehdi";
const TEST_BRAND_NAME = "Zitounidev";
const TEST_MARKETPLACE = "Mirakl";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { campaign = "Campagne Test", testMode = true, targets } = body as {
    campaign?: string;
    testMode?: boolean;
    targets?: { brandName: string; toEmail: string; toFirstName?: string; marketplaceName?: string }[];
  };

  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });

  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const callbackUrl = `${proto}://${host}/api/webhooks/n8n/preview`;

  const senderEmail = settings?.defaultSenderEmail ?? TEST_SENDER_EMAIL;
  const senderName = settings?.defaultSenderName ?? TEST_SENDER_NAME;

  const emailTargets =
    targets ??
    (testMode
      ? [
          {
            brandName: TEST_BRAND_NAME,
            toEmail: TEST_RECIPIENT_EMAIL,
            toFirstName: TEST_RECIPIENT_NAME,
            marketplaceName: TEST_MARKETPLACE,
          },
        ]
      : []);

  const payload = {
    event: "campaign.launch",
    campaign,
    sender: { email: senderEmail, firstName: senderName },
    callbackUrl,
    targets: emailTargets,
  };

  const webhookHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (settings?.n8nWebhookSecret) {
    webhookHeaders["X-Webhook-Secret"] = settings.n8nWebhookSecret;
  }

  let n8nOk = false;
  let n8nError: string | null = null;

  try {
    const res = await fetch(N8N_LAUNCH_WEBHOOK, {
      method: "POST",
      headers: webhookHeaders,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    n8nOk = res.ok;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      n8nError = `HTTP ${res.status} — ${text.slice(0, 120)}`;
    }
  } catch (err) {
    n8nError = err instanceof Error ? err.message : "Erreur réseau";
  }

  // Always create a local draft so the operator can see and edit something immediately.
  // n8n will also push its own drafts via /api/webhooks/n8n/preview once it processes the request.
  const draft = await prisma.emailDraft.create({
    data: {
      brandName: emailTargets[0]?.brandName ?? TEST_BRAND_NAME,
      marketplaceName: emailTargets[0]?.marketplaceName ?? TEST_MARKETPLACE,
      campaign,
      step: 1,
      toEmail: emailTargets[0]?.toEmail ?? TEST_RECIPIENT_EMAIL,
      toFirstName: emailTargets[0]?.toFirstName ?? TEST_RECIPIENT_NAME,
      subject: `Opportunité de partenariat — ${emailTargets[0]?.marketplaceName ?? TEST_MARKETPLACE} × ${emailTargets[0]?.brandName ?? TEST_BRAND_NAME}`,
      bodyText: `Bonjour ${emailTargets[0]?.toFirstName ?? TEST_RECIPIENT_NAME},\n\nNous avons identifié ${emailTargets[0]?.brandName ?? TEST_BRAND_NAME} comme une marque à fort potentiel pour une collaboration sur ${emailTargets[0]?.marketplaceName ?? TEST_MARKETPLACE}.\n\nVotre positionnement et vos ambitions de croissance correspondent parfaitement à notre écosystème. Nous aimerions vous présenter les avantages concrets d'une présence sur notre plateforme.\n\nSeriez-vous disponible pour un échange de 20 minutes cette semaine ?\n\nCordialement,\n${senderName}\n${senderEmail}`,
      cta: "Planifier un appel découverte",
      stopRule: "Stopper si réponse positive reçue",
      claimSources: JSON.stringify([]),
      callbackUrl: settings?.n8nWebhookUrl ?? null,
      status: "PENDING",
    },
  });

  return NextResponse.json({
    ok: true,
    n8nOk,
    n8nError,
    draftId: draft.id,
    message: n8nOk
      ? `Campagne lancée — ${emailTargets.length} cible${emailTargets.length > 1 ? "s" : ""} envoyée${emailTargets.length > 1 ? "s" : ""} à n8n. Aperçu créé dans la boîte de réception.`
      : `Aperçu créé dans la boîte de réception. n8n non joignable${n8nError ? ` : ${n8nError}` : ""}.`,
  });
}
