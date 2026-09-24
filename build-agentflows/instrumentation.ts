export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { interruptRuns } = await import("@/lib/flow-store");
    const { recoverEmbedJobs, drainEmbedJobs } = await import("@/lib/embed-runtime");
    interruptRuns(); recoverEmbedJobs();
    const timer = setInterval(() => { void drainEmbedJobs().catch(console.error); }, 1000);
    timer.unref();
  }
}
