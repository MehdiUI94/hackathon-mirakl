import { NextResponse } from "next/server";
import { tickSequences } from "@/lib/sequence-engine";

export async function POST() {
  const result = await tickSequences();
  return NextResponse.json(result);
}
