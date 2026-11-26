import prisma from "@/dbConnection";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { computeWebsiteMetrics } from "@/lib/metrics";

const TICKS_PER_WEBSITE = 30;

export async function GET(req: NextRequest) {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const websites = await prisma.website.findMany({
      where: { userid: userId },
      orderBy: { timeAdded: "desc" },
      include: {
        ticks: {
          orderBy: { createdAt: "desc" },
          take: TICKS_PER_WEBSITE,
          include: {
            region: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    const enriched = websites.map((site) => ({
      id: site.id,
      url: site.url,
      timeAdded: site.timeAdded,
      metrics: computeWebsiteMetrics(site.ticks),
      ticks: site.ticks,
    }));

    return NextResponse.json({ success: true, websites: enriched });
  } catch (error) {
    console.error("[getAllWebsites] Failed to query websites:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
