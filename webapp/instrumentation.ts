export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const { startSequenceCron } = await import("./lib/sequence-engine");
    startSequenceCron();
  }
}
