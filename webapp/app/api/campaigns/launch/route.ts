import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

const TEST_SENDER_EMAIL = "mzitouni@eugeniaschool.com";
const TEST_SENDER_NAME = "Mehdi";
const TEST_RECIPIENT_EMAIL = "zitounimehdi7@gmail.com";
const TEST_RECIPIENT_NAME = "Mehdi";
const TEST_BRAND_NAME = "Zitounidev";
const TEST_MARKETPLACE = "Mirakl";

type LaunchTarget = {
  brandName: string;
  toEmail: string;
  toFirstName?: string;
  marketplaceName?: string;
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { campaign = "Campagne Test", testMode = true, targets } = body as {
    campaign?: string;
    testMode?: boolean;
    targets?: LaunchTarget[];
  };

  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });

  const appBaseUrl = getAppBaseUrl(req);
  const callbackUrl = `${appBaseUrl}/api/webhooks/n8n/preview`;
  const n8nLaunchWebhookUrl =
    settings?.n8nWebhookUrl ?? process.env.N8N_LAUNCH_WEBHOOK_URL ?? "";

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

  if (emailTargets.length === 0) {
    return NextResponse.json(
      { error: "Aucune cible a lancer. Selectionnez au moins une marque." },
      { status: 400 }
    );
  }

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

  if (!n8nLaunchWebhookUrl) {
    n8nError = "URL webhook n8n non configuree";
  } else {
    try {
      const res = await fetch(n8nLaunchWebhookUrl, {
        method: "POST",
        headers: webhookHeaders,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      n8nOk = res.ok;
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        n8nError = `HTTP ${res.status} - ${text.slice(0, 120)}`;
      }
    } catch (err) {
      n8nError = err instanceof Error ? err.message : "Erreur reseau";
    }
  }

  return NextResponse.json({
    ok: true,
    n8nOk,
    n8nError,
    message: n8nOk
      ? `Campagne lancee - ${emailTargets.length} cible${emailTargets.length > 1 ? "s" : ""} envoyee${emailTargets.length > 1 ? "s" : ""} a n8n. Les apercus apparaitront dans la boite de reception quand n8n les renverra.`
      : `Campagne non envoyee a n8n${n8nError ? ` : ${n8nError}` : ""}. Aucun apercu local n'a ete cree.`,
  });
}

function getAppBaseUrl(req: NextRequest) {
  const configured = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");

  return `${proto}://${host}`;
}
