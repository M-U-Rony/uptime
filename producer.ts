import { AddSites } from "./redis";
import prisma from "./dbConnection";

async function main() {
  try {
   
    const websites = await prisma.website.findMany({})
    AddSites(websites);

  } catch (error) {
    console.log(error);
  }
}

main();

setInterval(() => {
  main();
}, 60*1000);

