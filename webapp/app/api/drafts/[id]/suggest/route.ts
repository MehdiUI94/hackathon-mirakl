import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const draft = await prisma.emailDraft.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  const apiKey = settings?.llmApiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Clé API Claude non configurée dans les Réglages." },
      { status: 422 }
    );
  }

  const client = new Anthropic({ apiKey });

  const prompt = `Tu es un expert en cold email B2B pour des marketplaces e-commerce. Analyse cet email de prospection et propose une version améliorée.

Marque destinataire : ${draft.brandName}
Marketplace : ${draft.marketplaceName}
Étape de séquence : ${draft.step}
${draft.cta ? `CTA souhaité : ${draft.cta}` : ""}

OBJET ACTUEL :
${draft.subject}

CORPS ACTUEL :
${draft.bodyText}

Réponds UNIQUEMENT avec un objet JSON valide (pas de markdown, pas de \`\`\`) :
{
  "subject": "Nouvel objet amélioré (< 60 caractères, accrocheur, personnalisé)",
  "bodyText": "Corps complet revu (< 150 mots, ton humain, valeur claire, personnalisé pour ${draft.brandName})",
  "tips": ["Ce qui a été amélioré et pourquoi — max 3 points"]
}`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text.trim() : "";
    // Strip potential markdown fences
    const jsonText = rawText.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
    const suggestions = JSON.parse(jsonText);

    return NextResponse.json(suggestions);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur Claude API" },
      { status: 500 }
    );
  }
}
