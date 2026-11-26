import { getRedisClient } from "./connection";

export const UPTIME_STREAM_KEY = "uptime";
export const STREAM_MAX_LEN = 10_000;
const ENQUEUE_BATCH_SIZE = 50;

export interface Site {
  id: string;
  url: string;
  timeAdded: Date;
  userid: string;
}

/**
 * Enqueues websites into the Redis Stream in bounded batches and trims the stream
 * approximately to STREAM_MAX_LEN to prevent unbounded Redis memory growth.
 */
export async function AddSites(sites: Site[]): Promise<number> {
  if (sites.length === 0) return 0;

  const client = await getRedisClient();

  for (let i = 0; i < sites.length; i += ENQUEUE_BATCH_SIZE) {
    const batch = sites.slice(i, i + ENQUEUE_BATCH_SIZE);
    await Promise.all(
      batch.map((site) =>
        client.xAdd(
          UPTIME_STREAM_KEY,
          "*",
          {
            url: site.url,
            siteId: site.id,
          },
          {
            TRIM: {
              strategy: "MAXLEN",
              strategyModifier: "~",
              threshold: STREAM_MAX_LEN,
            },
          }
        )
      )
    );
  }

  return sites.length;
}
