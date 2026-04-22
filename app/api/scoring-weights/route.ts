import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const weights = await prisma.scoringWeights.findMany({
    orderBy: [{ isDefault: "desc" }, { profileName: "asc" }],
  });
  return NextResponse.json(weights);
}
