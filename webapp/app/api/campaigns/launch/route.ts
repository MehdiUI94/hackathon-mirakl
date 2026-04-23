import { prisma } from "@/lib/db";
import { createFallbackDraft, useNetlifyDraftStore } from "@/lib/netlify-draft-store";
import { NextRequest, NextResponse } from "next/server";

const TEST_SENDER_EMAIL = "mzitouni@eugeniaschool.com";
const TEST_SENDER_NAME = "Mehdi";
const TEST_RECIPIENT_EMAIL = "zitounimehdi7@gmail.com";
const TEST_RECIPIENT_NAME = "Mehdi";
const TEST_BRAND_NAME = "Zitounidev";
const TEST_MARKETPLACE = "Mirakl";

type LaunchTarget = {
  brandName: string;
  amazonNotZalando?: boolean;
  toEmail: string;
  toFirstName?: string;
  marketplaceName?: string;
};

type LaunchPreviewResponse = {
  info?: Partial<LaunchTarget> & {
    campaign?: string;
    sender?: { email?: string; firstName?: string };
  };
  output?: {
    subject_line?: string;
    body?: string;
  };
  subject_line?: string;
  body?: string;
  conversationUrl?: string;
  callbackUrl?: string;
  webhookUrl?: string;
  n8nExecutionId?: string;
  objet?: string;
  object?: string;
  email?: string;
};

type LaunchPreviewDraft = {
  id: string;
  brandId: null;
  marketplaceId: null;
  brandName: string;
  marketplaceName: string;
  campaign: string | null;
  step: number;
  branch: null;
  toEmail: string;
  toFirstName: string | null;
  subject: string;
  bodyText: string;
  cta: null;
  stopRule: null;
  claimSources: string;
  callbackUrl: string | null;
  status: "PENDING";
  edited: false;
  receivedAt: string;
  decidedAt: null;
  sentAt: null;
  errorMessage: null;
  localOnly: true;
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
  const callbackUrlIsPublic = isPublicCallbackUrl(appBaseUrl);
  const n8nLaunchWebhookUrl =
    settings?.n8nWebhookUrl ??
    process.env.N8N_LAUNCH_WEBHOOK_URL ??
    process.env.N8N_WEBHOOK_URL ??
    "";

  const senderEmail =
    settings?.defaultSenderEmail ??
    process.env.DEFAULT_SENDER_EMAIL ??
    TEST_SENDER_EMAIL;
  const senderName =
    settings?.defaultSenderName ??
    process.env.DEFAULT_SENDER_NAME ??
    TEST_SENDER_NAME;

  const normalizedTargets = targets
    ? await enrichTargets(targets)
    : null;

  const emailTargets =
    normalizedTargets ??
    (testMode
      ? [
          {
            brandName: TEST_BRAND_NAME,
            amazonNotZalando: false,
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
  const n8nWebhookSecret =
    settings?.n8nWebhookSecret ?? process.env.N8N_WEBHOOK_SECRET ?? "";

  if (n8nWebhookSecret) {
    webhookHeaders["X-Webhook-Secret"] = n8nWebhookSecret;
  }

  let n8nOk = false;
  let n8nError: string | null = null;
  let callbackWarning: string | null = null;
  let createdDrafts = 0;
  let previewDrafts: LaunchPreviewDraft[] = [];

  if (!callbackUrlIsPublic) {
    callbackWarning =
      "L'URL de callback de cette app n'est pas publique. Configure APP_BASE_URL avec une URL publique (ngrok, Cloudflare Tunnel, domaine deploye) pour que n8n Cloud puisse renvoyer les apercus.";
  }

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
        const raw = await res.text().catch(() => "");
        let parsed: { message?: string } = {};
        try { parsed = JSON.parse(raw); } catch { /* not JSON */ }
        const msg = parsed.message ?? "";

        if (res.status === 404 && msg.includes("not registered")) {
          n8nError =
            "Webhook n8n non enregistre. Active le workflow dans n8n (toggle Active en haut a droite) ou, pour un test ponctuel, clique sur 'Listen for test event' et utilise la Test URL.";
        } else if (res.status === 404) {
          n8nError = "Webhook n8n introuvable (404). Verifie l'URL dans Settings.";
        } else if (res.status === 401 || res.status === 403) {
          n8nError = "Authentification n8n refusee. Verifie X-Webhook-Secret dans Settings.";
        } else {
          n8nError = `HTTP ${res.status} - ${raw.slice(0, 120)}`;
        }
      } else {
        const raw = await res.text().catch(() => "");
        previewDrafts = await persistPreviewsFromLaunchResponse({
          raw,
          campaign,
          callbackUrl,
          targets: emailTargets,
        });
        createdDrafts = previewDrafts.length;
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        n8nError = "n8n n'a pas repondu en 10s. Verifie que l'instance est en ligne.";
      } else {
        n8nError = err instanceof Error ? err.message : "Erreur reseau";
      }
    }
  }

  return NextResponse.json({
    ok: true,
    n8nOk,
    n8nError,
    createdDrafts,
    previewDrafts,
    callbackUrl,
    callbackWarning,
    message: n8nOk
      ? `Campagne lancee - ${emailTargets.length} cible${emailTargets.length > 1 ? "s" : ""} envoyee${emailTargets.length > 1 ? "s" : ""} a n8n.${createdDrafts > 0 ? ` ${createdDrafts} apercu${createdDrafts > 1 ? "s" : ""} cree${createdDrafts > 1 ? "s" : ""} directement depuis la reponse n8n.` : callbackWarning ? ` ${callbackWarning}` : " Les apercus apparaitront dans la boite de reception quand n8n les renverra."}`
      : `Campagne non envoyee a n8n${n8nError ? ` : ${n8nError}` : ""}. Aucun apercu local n'a ete cree.`,
  });
}

async function persistPreviewsFromLaunchResponse({
  raw,
  campaign,
  callbackUrl,
  targets,
}: {
  raw: string;
  campaign: string;
  callbackUrl: string;
  targets: LaunchTarget[];
}) {
  if (!raw.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const responses = Array.isArray(parsed) ? parsed : [parsed];
  const previewDrafts: LaunchPreviewDraft[] = [];

  for (let index = 0; index < responses.length; index += 1) {
    const response = responses[index];
    if (!response || typeof response !== "object") continue;

    const preview = response as LaunchPreviewResponse;
    const subject =
      asNonEmptyString(preview.output?.subject_line) ??
      asNonEmptyString(preview.subject_line) ??
      asNonEmptyString(preview.objet) ??
      asNonEmptyString(preview.object);
    const bodyText =
      asNonEmptyString(preview.output?.body) ??
      asNonEmptyString(preview.body) ??
      asNonEmptyString(preview.email);

    if (!subject || !bodyText) continue;

    const fallbackTarget = targets[index] ?? targets[0];
    if (!fallbackTarget) continue;

    const brandName =
      asNonEmptyString(preview.info?.brandName) ?? fallbackTarget.brandName ?? "Marque inconnue";
    const marketplaceName =
      asNonEmptyString(preview.info?.marketplaceName) ??
      fallbackTarget.marketplaceName ??
      "Marketplace inconnue";
    const toEmail =
      asNonEmptyString(preview.info?.toEmail) ?? fallbackTarget.toEmail;
    const toFirstName =
      asNonEmptyString(preview.info?.toFirstName) ?? fallbackTarget.toFirstName ?? null;

    if (!toEmail) continue;

    const previewDraft: LaunchPreviewDraft = {
      id: `local-preview-${crypto.randomUUID()}`,
      brandId: null,
      marketplaceId: null,
      brandName,
      marketplaceName,
      campaign: asNonEmptyString(preview.info?.campaign) ?? campaign,
      step: index + 1,
      branch: null,
      toEmail,
      toFirstName,
      subject,
      bodyText,
      cta: null,
      stopRule: null,
      claimSources: JSON.stringify([]),
      callbackUrl: asNonEmptyString(preview.callbackUrl) ?? callbackUrl,
      status: "PENDING",
      edited: false,
      receivedAt: new Date().toISOString(),
      decidedAt: null,
      sentAt: null,
      errorMessage: null,
      localOnly: true,
    };
    previewDrafts.push(previewDraft);

    const meta = {
      ...(preview.conversationUrl ? { conversationUrl: preview.conversationUrl } : {}),
      ...(preview.webhookUrl ? { webhookUrl: preview.webhookUrl } : {}),
      ...(fallbackTarget.amazonNotZalando !== undefined
        ? { amazonNotZalando: fallbackTarget.amazonNotZalando }
        : {}),
    };

    if (useNetlifyDraftStore()) {
      await createFallbackDraft({
        brandId: null,
        marketplaceId: null,
        brandName,
        marketplaceName,
        campaign: asNonEmptyString(preview.info?.campaign) ?? campaign,
        step: index + 1,
        branch: null,
        toEmail,
        toFirstName,
        subject,
        bodyText,
        cta: null,
        stopRule: null,
        claimSources: JSON.stringify([]),
        meta: JSON.stringify(meta),
        callbackUrl: asNonEmptyString(preview.callbackUrl) ?? callbackUrl,
        n8nExecutionId: asNonEmptyString(preview.n8nExecutionId) ?? null,
        status: "PENDING",
        edited: false,
      });
      continue;
    }

    await prisma.emailDraft.create({
      data: {
        brandId: null,
        marketplaceId: null,
        brandName,
        marketplaceName,
        campaign: asNonEmptyString(preview.info?.campaign) ?? campaign,
        step: index + 1,
        branch: null,
        toEmail,
        toFirstName,
        subject,
        bodyText,
        cta: null,
        stopRule: null,
        claimSources: JSON.stringify([]),
        meta: JSON.stringify(meta),
        callbackUrl: asNonEmptyString(preview.callbackUrl) ?? callbackUrl,
        n8nExecutionId: asNonEmptyString(preview.n8nExecutionId) ?? null,
        status: "PENDING",
      },
    });
  }

  return previewDrafts;
}

function getAppBaseUrl(req: NextRequest) {
  const configured =
    process.env.N8N_CALLBACK_BASE_URL ??
    process.env.APP_BASE_URL ??
    process.env.RENDER_EXTERNAL_URL ??
    process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");

  return `${proto}://${host}`;
}

function isPublicCallbackUrl(appBaseUrl: string) {
  try {
    const url = new URL(appBaseUrl);
    const host = url.hostname.toLowerCase();

    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    if (host.endsWith(".local")) return false;
    if (/^10\./.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;

    return true;
  } catch {
    return false;
  }
}

function normalizeRecipientEmail(email: string) {
  const trimmed = email.trim();
  if (trimmed.toLowerCase().endsWith("@eugeniaschool.example")) {
    return TEST_RECIPIENT_EMAIL;
  }
  return trimmed;
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function enrichTargets(targets: LaunchTarget[]) {
  const brandNames = Array.from(
    new Set(targets.map((target) => target.brandName.trim()).filter(Boolean))
  );

  const brands = brandNames.length
    ? await prisma.brand.findMany({
        where: { name: { in: brandNames } },
        select: { name: true, amazonSignal: true, zalandoSignal: true },
      })
    : [];

  const amazonStatusByBrand = new Map(
    brands.map((brand) => [
      brand.name,
      isAmazonNotZalando(brand.amazonSignal, brand.zalandoSignal),
    ])
  );

  return targets.map((target) => ({
    ...target,
    amazonNotZalando:
      target.amazonNotZalando ??
      amazonStatusByBrand.get(target.brandName.trim()) ??
      false,
    toEmail: normalizeRecipientEmail(target.toEmail),
  }));
}

function isAmazonNotZalando(amazonSignal: string | null, zalandoSignal: string | null) {
  const amazon = (amazonSignal ?? "").toLowerCase();
  const zalando = (zalandoSignal ?? "").toLowerCase();
  return /oui|observed|signal|storefront|search/.test(amazon) && /\bnon\b|absent|pas de/.test(zalando);
}
