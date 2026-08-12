import client from "./connection";

interface Site {
  id: string;
  url: string;
  timeAdded: Date;
  userid: string;
}


export async function AddSites(sites: Site[]) {
 
  await Promise.all(
    sites.map((site) =>
      client.xAdd("uptime", "*", { url: site.url,siteId: site.id})
    )
  );
}
