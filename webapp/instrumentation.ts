export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSequenceCron } = await import("./lib/sequence-engine");
    startSequenceCron();
  }
}
