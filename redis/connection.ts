import { createClient } from "redis";

export function createRedisClient(label = "default") {
  const client = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
    socket: {
      reconnectStrategy(retries) {
        return Math.min(retries * 200, 5000);
      },
    },
  });

  client.on("error", (err) => {
    console.error(`[redis:${label}] Client error:`, err);
  });

  return client;
}

export type AppRedisClient = ReturnType<typeof createRedisClient>;

let sharedClient: AppRedisClient | null = null;
let connectPromise: Promise<AppRedisClient> | null = null;

export async function getRedisClient(): Promise<AppRedisClient> {
  if (!sharedClient) {
    sharedClient = createRedisClient("shared");
  }

  if (sharedClient.isOpen) {
    return sharedClient;
  }

  if (!connectPromise) {
    connectPromise = sharedClient
      .connect()
      .then(() => sharedClient!)
      .finally(() => {
        connectPromise = null;
      });
  }

  return connectPromise;
}

export async function closeSharedRedisClient(): Promise<void> {
  if (sharedClient && sharedClient.isOpen) {
    await sharedClient.quit();
  }
  sharedClient = null;
}
