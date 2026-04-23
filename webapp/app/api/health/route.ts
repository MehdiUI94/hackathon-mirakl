import { NextResponse } from "next/server";

export async function GET() {
  const publicBaseUrl =
    process.env.N8N_CALLBACK_BASE_URL ??
    process.env.APP_BASE_URL ??
    process.env.RENDER_EXTERNAL_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    null;

  return NextResponse.json({
    ok: true,
    service: "webapp",
    timestamp: new Date().toISOString(),
    previewEndpoint: "/api/emails/preview",
    webhookEndpoint: "/api/webhooks/n8n/preview",
    publicBaseUrl,
  });
}
