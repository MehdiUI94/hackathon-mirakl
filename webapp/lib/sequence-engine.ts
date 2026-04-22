import { prisma } from "@/lib/db";

/**
 * Sequence engine: for each non-paused / non-stopped CampaignTarget, look at
 * the last sent EmailSend on that target. If `delayDays` for the next step
 * has elapsed and no stop condition is active for the lead (replied, bounced,
 * unsubscribed, meeting booked), enqueue a DRAFT EmailSend for step N+1 so
 * an external worker (n8n) can pick it up.
 *
 * NB: this only enqueues drafts; the actual outbound POST to n8n is performed
 * either manually via the UI or by a future scheduled push job.
 */
export async function tickSequences(now: Date = new Date()): Promise<{ enqueued: number }> {
  const targets = await prisma.campaignTarget.findMany({
    where: { paused: false, stopped: false },
    include: {
      emailTemplates: {
        orderBy: { step: "asc" },
        include: {
          emailSends: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });

  let enqueued = 0;

  for (const target of targets) {
    const allSends = target.emailTemplates.flatMap((et) => et.emailSends);
    // Stop conditions
    const hasStop = allSends.some(
      (s) =>
        s.replyAt != null ||
        s.meetingBooked ||
        s.status === "BOUNCED" ||
        s.status === "STOPPED" ||
        s.replyType === "UNSUBSCRIBE"
    );
    if (hasStop) continue;

    // Find highest already-sent step
    const sentSteps = target.emailTemplates
      .filter((et) => et.emailSends.some((s) => s.status === "SENT" || s.status === "OPENED"))
      .map((et) => et.step);
    const lastSentStep = sentSteps.length > 0 ? Math.max(...sentSteps) : 0;

    // Find the next template step to enqueue
    const nextTemplate = target.emailTemplates.find((et) => et.step === lastSentStep + 1);
    if (!nextTemplate) continue;

    // Already enqueued?
    if (nextTemplate.emailSends.length > 0) continue;

    // Need at least the previous sentAt + delayDays
    if (lastSentStep > 0) {
      const prevTemplate = target.emailTemplates.find((et) => et.step === lastSentStep);
      const prevSent = prevTemplate?.emailSends.find((s) => s.sentAt != null);
      if (!prevSent?.sentAt) continue;
      const due = new Date(prevSent.sentAt);
      due.setDate(due.getDate() + (nextTemplate.delayDays ?? 0));
      if (now < due) continue;
    }

    // Need a recipient — copy from prior send if any
    const lastSendWithEmail = allSends.find((s) => s.toEmail);
    if (!lastSendWithEmail) continue;

    await prisma.emailSend.create({
      data: {
        emailTemplateId: nextTemplate.id,
        toEmail: lastSendWithEmail.toEmail,
        toFirstName: lastSendWithEmail.toFirstName,
        renderedSubject: nextTemplate.subject,
        renderedBody: nextTemplate.bodyText,
        status: "DRAFT",
      },
    });
    enqueued++;
  }

  return { enqueued };
}

let started = false;

export function startSequenceCron() {
  if (started) return;
  started = true;
  // Lazy import so node-cron isn't pulled into edge runtime
  import("node-cron").then(({ default: cron }) => {
    cron.schedule("*/5 * * * *", async () => {
      try {
        const { enqueued } = await tickSequences();
        if (enqueued > 0) {
          console.log(`[sequence-engine] enqueued ${enqueued} drafts`);
        }
      } catch (err) {
        console.error("[sequence-engine] tick failed", err);
      }
    });
    console.log("[sequence-engine] cron started (every 5 min)");
  });
}
