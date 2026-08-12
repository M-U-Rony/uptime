import prisma from "@/dbConnection";
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  const user = await prisma.user.findFirst({
    where: {
      username,
    },
  });

  if (!user || user.password !== password) {
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: 401 }
    );
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return NextResponse.json(
      { error: "Server configuration error: JWT_SECRET missing" },
      { status: 500 }
    );
  }

  const token = jwt.sign(
    {
      userId: user.id,
    },
    jwtSecret
  );

  const response = NextResponse.json({ success: true, token });

  response.cookies.set("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  });

  return response;
}