import jwt from "jsonwebtoken";
import type { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "token";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  userId: string;
  username?: string;
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error("Server configuration error: JWT_SECRET is not set");
  }
  return secret;
}

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: SESSION_MAX_AGE_SECONDS,
  });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    const decoded = jwt.verify(token, secret);
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      "userId" in decoded &&
      typeof (decoded as { userId: unknown }).userId === "string"
    ) {
      const payload = decoded as { userId: string; username?: unknown };
      return {
        userId: payload.userId,
        username: typeof payload.username === "string" ? payload.username : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Verifies the signed HttpOnly session cookie directly in route handlers
 * instead of trusting spoofable request headers.
 */
export function getAuthenticatedUserId(req: NextRequest): string | null {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = verifySessionToken(token);
  return session?.userId ?? null;
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
