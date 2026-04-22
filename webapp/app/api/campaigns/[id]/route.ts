import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const PatchSchema = z.object({
  action: z.enum(["pause", "resume", "stop"]),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const target = await prisma.campaignTarget.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: { paused?: boolean; stopped?: boolean } = {};
  switch (parsed.data.action) {
    case "pause":
      data.paused = true;
      break;
    case "resume":
      data.paused = false;
      data.stopped = false;
      break;
    case "stop":
      data.stopped = true;
      data.paused = false;
      break;
  }
  const updated = await prisma.campaignTarget.update({ where: { id }, data });
  return NextResponse.json(updated);
}
