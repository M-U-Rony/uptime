import prisma from "@/dbConnection";
import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/password";
import { setSessionCookie, signSessionToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const username =
    typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const validPassword = await verifyPassword(password, user.password);
    if (!validPassword) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const token = signSessionToken({
      userId: user.id,
      username: user.username,
    });

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, username: user.username },
    });

    setSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("[signin] Failed to authenticate user:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
