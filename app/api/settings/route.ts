import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const Schema = z.object({
  n8nWebhookUrl: z.string().url().optional().or(z.literal("")),
  n8nWebhookSecret: z.string().optional(),
  defaultSenderName: z.string().optional(),
  defaultSenderEmail: z.string().email().optional().or(z.literal("")),
  llmProvider: z.string().optional(),
  llmApiKey: z.string().optional(),
  searchProvider: z.string().optional(),
  searchApiKey: z.string().optional(),
});

export async function GET() {
  const settings = await prisma.appSettings.findUnique({
    where: { id: "singleton" },
  });
  // Never expose API keys to client beyond existence check
  return NextResponse.json({
    n8nWebhookUrl: settings?.n8nWebhookUrl ?? "",
    n8nWebhookSecret: settings?.n8nWebhookSecret ? "***" : "",
    defaultSenderName: settings?.defaultSenderName ?? "",
    defaultSenderEmail: settings?.defaultSenderEmail ?? "",
    llmProvider: settings?.llmProvider ?? "",
    llmApiKey: settings?.llmApiKey ? "***" : "",
    searchProvider: settings?.searchProvider ?? "",
    searchApiKey: settings?.searchApiKey ? "***" : "",
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data: Record<string, string | null> = {};
  const raw = parsed.data;

  if (raw.n8nWebhookUrl !== undefined) data.n8nWebhookUrl = raw.n8nWebhookUrl || null;
  if (raw.defaultSenderName !== undefined) data.defaultSenderName = raw.defaultSenderName || null;
  if (raw.defaultSenderEmail !== undefined) data.defaultSenderEmail = raw.defaultSenderEmail || null;
  if (raw.llmProvider !== undefined) data.llmProvider = raw.llmProvider || null;
  if (raw.searchProvider !== undefined) data.searchProvider = raw.searchProvider || null;
  // Only update keys if they aren't the mask
  if (raw.n8nWebhookSecret && raw.n8nWebhookSecret !== "***")
    data.n8nWebhookSecret = raw.n8nWebhookSecret;
  if (raw.llmApiKey && raw.llmApiKey !== "***")
    data.llmApiKey = raw.llmApiKey;
  if (raw.searchApiKey && raw.searchApiKey !== "***")
    data.searchApiKey = raw.searchApiKey;

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  return NextResponse.json({ ok: true });
}
