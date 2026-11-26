import prisma from "@/dbConnection";
import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/password";
import { setSessionCookie, signSessionToken } from "@/lib/auth";

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;

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

  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json(
      {
        error:
          "Username must be 3-32 characters using only letters, numbers, underscores, or hyphens",
      },
      { status: 400 }
    );
  }

  if (password.length < 8 || password.length > 128) {
    return NextResponse.json(
      { error: "Password must be between 8 and 128 characters" },
      { status: 400 }
    );
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const newUser = await prisma.user.create({
      data: {
        username,
        password: passwordHash,
      },
      select: { id: true, username: true },
    });

    const token = signSessionToken({
      userId: newUser.id,
      username: newUser.username,
    });

    const response = NextResponse.json(
      { success: true, user: { id: newUser.id, username: newUser.username } },
      { status: 201 }
    );
    setSessionCookie(response, token);

    return response;
  } catch (error) {
    console.error("[signup] Failed to create user:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
