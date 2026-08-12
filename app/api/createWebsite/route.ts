
import prisma from "@/dbConnection";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const userId = req.headers.get("user-id");

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {url} = await req.json();

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  const website = await prisma.website.create({
    data: {
      url,
      timeAdded: new Date(),
      userid: userId,
    },
  });

  return NextResponse.json({ success: true, websiteId: website.id });
}
