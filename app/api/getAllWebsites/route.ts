import prisma from "@/dbConnection";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const userId = req.headers.get("user-id");

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const websites = await prisma.website.findMany({
    where:{
        userid: userId
    }
  });

  return NextResponse.json({ success: true, websites: websites });
}
