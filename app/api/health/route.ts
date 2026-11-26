import prisma from "@/dbConnection";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[health] Database check failed:", error);
    return NextResponse.json(
      { status: "degraded", error: "Database unavailable" },
      { status: 503 }
    );
  }
}
