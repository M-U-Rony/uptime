import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const publicPaths = ["/signin", "/signup", "/api/signin", "/api/signup"];

export function proxy(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  const { pathname } = req.nextUrl;

  let userId: string | null = null;

  if (token) {
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (jwtSecret) {
        const decoded = jwt.verify(token, jwtSecret) as { userId: string };
        userId = decoded.userId;
      }
    } catch {
      userId = null;
    }
  }

  const isPublic = publicPaths.includes(pathname);

  // 1. Protected API Routes
  if (pathname.startsWith("/api") && !isPublic) {
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("user-id", userId);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // 2. Protected UI Pages
  if (!userId && !isPublic) {
    const signInUrl = new URL("/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // 3. Authenticated Users visiting /signin or /signup
  if (userId && (pathname === "/signin" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};