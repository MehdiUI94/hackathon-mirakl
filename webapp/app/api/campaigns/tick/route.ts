import { NextResponse } from "next/server";
import { tickSequences } from "@/lib/sequence-engine";

async function handleTick(request: Request) {
  if (process.env.CRON_SECRET) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await tickSequences();
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return handleTick(request);
}

export async function POST(request: Request) {
  return handleTick(request);
}
