import prisma from "./dbConnection";
import { createRedisClient, type AppRedisClient } from "./redis/connection";
import { UPTIME_STREAM_KEY } from "./redis";
import { assertPublicDns, validateMonitorUrl } from "./lib/urlGuard";

const REGION_DEFINITIONS = [
  { id: "bd", name: "Bangladesh" },
  { id: "ind", name: "India" },
] as const;

const CONSUMERS_PER_REGION = 2;
const PROBE_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 5_000);
const MAX_REDIRECT_HOPS = 3;
const READ_BLOCK_MS = 5_000;
const STALE_PENDING_IDLE_MS = 60_000;
const RECLAIM_INTERVAL_MS = 30_000;

interface StreamMessage {
  id: string;
  message: Record<string, string>;
}

interface ProbeResult {
  status: "up" | "down";
  statusCode: number | null;
  resTimeMs: number;
  blockedReason?: string;
}

let isShuttingDown = false;
const activeClients: AppRedisClient[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2003"
  );
}

/**
 * Ensures Region rows ("bd", "ind") exist in PostgreSQL before any worker
 * attempts to write WebsiteTicks rows referencing Region.id.
 */
async function ensureRegionsSeeded(): Promise<void> {
  for (const region of REGION_DEFINITIONS) {
    await prisma.region.upsert({
      where: { id: region.id },
      update: { name: region.name },
      create: { id: region.id, name: region.name },
    });
  }
  console.log(
    `[worker] Seeded regions: ${REGION_DEFINITIONS.map((r) => r.id).join(", ")}`
  );
}

/**
 * Performs an SSRF-safe HTTP probe: validates URL syntax & host rules,
 * verifies DNS resolves exclusively to public IPs, and validates any redirect hops.
 */
export async function probeWebsite(rawUrl: string): Promise<ProbeResult> {
  const startTime = Date.now();
  let currentUrl = rawUrl;

  try {
    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
      const check = validateMonitorUrl(currentUrl);
      if (!check.ok) {
        return {
          status: "down",
          statusCode: null,
          resTimeMs: Date.now() - startTime,
          blockedReason: check.error,
        };
      }

      await assertPublicDns(check.hostname);

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(500, PROBE_TIMEOUT_MS - elapsed);

      const res = await fetch(check.normalizedUrl, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(remaining),
        headers: {
          "User-Agent": "UptimeMonitor/1.0 (+https://github.com/M-U-Rony/uptime)",
        },
      });

      // Consume/cancel body promptly to avoid socket leaks
      if (res.body) {
        await res.body.cancel().catch(() => {});
      }

      const isRedirect =
        res.status >= 300 && res.status < 400 && res.headers.has("location");

      if (isRedirect) {
        if (hop === MAX_REDIRECT_HOPS) {
          return {
            status: "down",
            statusCode: res.status,
            resTimeMs: Date.now() - startTime,
          };
        }
        const location = res.headers.get("location")!;
        currentUrl = new URL(location, check.normalizedUrl).toString();
        continue;
      }

      return {
        status: res.ok ? "up" : "down",
        statusCode: res.status,
        resTimeMs: Date.now() - startTime,
      };
    }

    return {
      status: "down",
      statusCode: null,
      resTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      status: "down",
      statusCode: null,
      resTimeMs: Date.now() - startTime,
      blockedReason: err instanceof Error ? err.message : undefined,
    };
  }
}

async function processMessage(
  client: AppRedisClient,
  region: string,
  entry: StreamMessage
): Promise<void> {
  const url = entry.message?.url;
  const siteId = entry.message?.siteId;

  // Ack malformed messages so poison entries don't block the PEL forever
  if (!url || !siteId) {
    console.warn(`[${region}] Malformed stream message ${entry.id}, acknowledging.`);
    await client.xAck(UPTIME_STREAM_KEY, region, entry.id);
    return;
  }

  const result = await probeWebsite(url);

  try {
    await prisma.websiteTicks.create({
      data: {
        website_id: siteId,
        res_time_ms: result.resTimeMs,
        status: result.status,
        statusCode: result.statusCode,
        region_id: region,
      },
    });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      // Website was deleted after being enqueued: acknowledge stale job
      console.warn(
        `[${region}] Website ${siteId} no longer exists (P2003); acknowledging stale job ${entry.id}.`
      );
      await client.xAck(UPTIME_STREAM_KEY, region, entry.id);
      return;
    }
    // Transient DB error: leave unacknowledged so XAUTOCLAIM retries after idle window
    console.error(`[${region}] Failed to persist tick for ${siteId}:`, err);
    return;
  }

  await client.xAck(UPTIME_STREAM_KEY, region, entry.id);
  console.log(
    `[${region}] ${url} -> ${result.status} (HTTP ${result.statusCode ?? "ERR"}, ${result.resTimeMs}ms)${
      result.blockedReason ? ` [${result.blockedReason}]` : ""
    }`
  );
}

/**
 * Reclaims stale unacknowledged PEL entries left behind by crashed workers.
 */
async function reclaimStalePending(
  client: AppRedisClient,
  group: string,
  consumerName: string
): Promise<void> {
  try {
    const claimed = await client.xAutoClaim(
      UPTIME_STREAM_KEY,
      group,
      consumerName,
      STALE_PENDING_IDLE_MS,
      "0-0",
      { COUNT: 10 }
    );

    if (claimed && Array.isArray(claimed.messages) && claimed.messages.length > 0) {
      for (const msg of claimed.messages) {
        if (!msg) continue;
        await processMessage(client, group, msg as StreamMessage);
      }
    }
  } catch (err) {
    if (!isShuttingDown) {
      console.error(`[${consumerName}] XAUTOCLAIM error:`, err);
    }
  }
}

async function runConsumer(group: string, consumerName: string): Promise<void> {
  // Each blocking consumer needs its own Redis connection so BLOCK doesn't
  // head-of-line block sibling consumers on a single socket.
  const client = createRedisClient(consumerName);
  activeClients.push(client);
  await client.connect();

  let lastReclaimAt = 0;

  while (!isShuttingDown) {
    try {
      const now = Date.now();
      if (now - lastReclaimAt >= RECLAIM_INTERVAL_MS) {
        lastReclaimAt = now;
        await reclaimStalePending(client, group, consumerName);
      }

      const response = await client.xReadGroup(
        group,
        consumerName,
        [{ key: UPTIME_STREAM_KEY, id: ">" }],
        { COUNT: 2, BLOCK: READ_BLOCK_MS }
      );

      if (response && response.length > 0) {
        for (const stream of response) {
          for (const message of stream.messages) {
            if (isShuttingDown) break;
            await processMessage(client, group, message as StreamMessage);
          }
        }
      }
    } catch (err) {
      if (isShuttingDown) break;
      console.error(`[${consumerName}] Consumer loop error:`, err);
      await sleep(1000);
    }
  }
}

async function startWorker(): Promise<void> {
  await ensureRegionsSeeded();

  const bootstrapClient = createRedisClient("bootstrap");
  await bootstrapClient.connect();

  try {
    for (const region of REGION_DEFINITIONS) {
      try {
        await bootstrapClient.xGroupCreate(UPTIME_STREAM_KEY, region.id, "0", {
          MKSTREAM: true,
        });
        console.log(`[worker] Consumer group '${region.id}' created.`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("BUSYGROUP")) {
          console.error(`[worker] Error creating group ${region.id}:`, err);
          throw err;
        }
      }
    }
  } finally {
    await bootstrapClient.quit();
  }

  const workers: Promise<void>[] = [];
  for (const region of REGION_DEFINITIONS) {
    for (let i = 1; i <= CONSUMERS_PER_REGION; i++) {
      workers.push(runConsumer(region.id, `${region.id}-worker-${i}`));
    }
  }

  console.log(`[worker] Started ${workers.length} regional consumer(s).`);
  await Promise.all(workers);
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[worker] Received ${signal}, shutting down gracefully...`);

  await Promise.allSettled([
    ...activeClients.map((c) => (c.isOpen ? c.quit() : Promise.resolve())),
    prisma.$disconnect(),
  ]);
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

// Only auto-start when executed directly (keeps `probeWebsite` importable for tests)
const entryArg = process.argv[1] || "";
if (entryArg.endsWith("worker.ts") || entryArg.endsWith("worker.js")) {
  startWorker().catch((err) => {
    console.error("[worker] Fatal startup error:", err);
    process.exit(1);
  });
}
