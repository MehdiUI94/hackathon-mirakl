import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export async function GET() {
  const weights = await prisma.scoringWeights.findMany({
    orderBy: [{ isDefault: "desc" }, { profileName: "asc" }],
  });
  return NextResponse.json(weights);
}

const SaveSchema = z.object({
  profileName: z.string().min(1).max(60),
  wCategory: z.number().int().min(0).max(50),
  wGeo: z.number().int().min(0).max(50),
  wScale: z.number().int().min(0).max(50),
  wOps: z.number().int().min(0).max(50),
  wPositioning: z.number().int().min(0).max(50),
  wIncrementality: z.number().int().min(0).max(50),
  wStory: z.number().int().min(0).max(50),
  wPenalty: z.number().int().min(-20).max(0).default(0),
  wPrior: z.number().min(0).max(30),
});

export async function POST(req: NextRequest) {
  const parsed = SaveSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const saved = await prisma.scoringWeights.upsert({
    where: { profileName: data.profileName },
    create: { ...data, isDefault: false, isSystem: false },
    update: { ...data, isSystem: false },
  });
  return NextResponse.json(saved, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const existing = await prisma.scoringWeights.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.isSystem) {
    return NextResponse.json({ error: "Cannot delete system profile" }, { status: 403 });
  }
  await prisma.scoringWeights.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
