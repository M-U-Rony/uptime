import prisma from "./dbConnection";
import client from "./redis/connection";

const REGIONS = ["bd", "ind"];

async function processMessage(region: string, message: any) {
  const { url, siteId } = message.message;
  console.log(`[${region}] Checking website: ${url}`);

  const startTime = Date.now();
  let status: "up" | "down" = "up";

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) status = "down";
  } catch {
    status = "down";
  }

  const resTimeMs = Date.now() - startTime;

  if (siteId) {
    await prisma.websiteTicks.create({
      data: {
        website_id: siteId,
        res_time_ms: resTimeMs,
        status: status,
        region_id: region,
      },
    });
  }

  // Acknowledge message in Redis
  await client.xAck("uptime", region, message.id);
  console.log(`[${region}] ${url} -> ${status} (${resTimeMs}ms)`);
}


async function runConsumer(group: string, consumerName: string) {
  while (true) {
    try {
      const response = await client.xReadGroup(
        group,
        consumerName,
        [{ key: "uptime", id: ">" }],
        { COUNT: 2 }
      );

      if (response && response.length > 0) {
        for (const stream of response) {
          for (const message of stream.messages) {
            await processMessage(group, message);
          }
        }
      }
    } catch (err) {
      console.error(`Consumer ${consumerName} error:`, err);
    }
  }
}

async function startWorker() {

  for (const region of REGIONS) {
    try {
      await client.xGroupCreate("uptime", region, "0", { MKSTREAM: true });
      console.log(`Group '${region}' created.`);
    } catch (err: any) {
      if (!err.message.includes("BUSYGROUP")) {
        console.error(`Error creating group ${region}:`, err);
      }
    }
  }

  Promise.all([
    runConsumer("bd", "bd-worker-1"),
    runConsumer("bd", "bd-worker-2"),
    runConsumer("ind", "ind-worker-1"),
    runConsumer("ind", "ind-worker-2"),
  ]);
}

startWorker();