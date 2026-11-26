import { AddSites } from "./redis";
import { closeSharedRedisClient } from "./redis/connection";
import prisma from "./dbConnection";

const INTERVAL_MS = Number(process.env.PRODUCER_INTERVAL_MS || 60_000);

let isRunning = false;
let isShuttingDown = false;
let activeCycle: Promise<void> | null = null;

async function runCycle(): Promise<void> {
  if (isRunning || isShuttingDown) {
    console.warn("[producer] Previous cycle still running; skipping tick.");
    return;
  }

  isRunning = true;
  try {
    const websites = await prisma.website.findMany({
      orderBy: { timeAdded: "asc" },
    });

    const count = await AddSites(websites);
    console.log(`[producer] Enqueued ${count} website(s) into Redis stream.`);
  } catch (error) {
    console.error("[producer] Failed to enqueue monitoring cycle:", error);
  } finally {
    isRunning = false;
  }
}

function triggerCycle(): void {
  activeCycle = runCycle().finally(() => {
    activeCycle = null;
  });
}

triggerCycle();

const timer = setInterval(triggerCycle, INTERVAL_MS);

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[producer] Received ${signal}, shutting down gracefully...`);

  clearInterval(timer);
  if (activeCycle) {
    await activeCycle;
  }

  await Promise.allSettled([closeSharedRedisClient(), prisma.$disconnect()]);
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
