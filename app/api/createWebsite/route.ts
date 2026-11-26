import prisma from "@/dbConnection";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { validateMonitorUrl } from "@/lib/urlGuard";

export async function POST(req: NextRequest) {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const validation = validateMonitorUrl(body.url);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const existing = await prisma.website.findFirst({
      where: {
        userid: userId,
        url: validation.normalizedUrl,
      },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "This website is already being monitored" },
        { status: 409 }
      );
    }

    const website = await prisma.website.create({
      data: {
        url: validation.normalizedUrl,
        timeAdded: new Date(),
        userid: userId,
      },
    });

    return NextResponse.json(
      { success: true, websiteId: website.id, website },
      { status: 201 }
    );
  } catch (error) {
    console.error("[createWebsite] Failed to register website:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
