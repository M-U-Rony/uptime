import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

const publicPagePaths = new Set(["/", "/signin", "/signup"]);
const publicApiPaths = new Set([
  "/api/signin",
  "/api/signup",
  "/api/signout",
  "/api/health",
]);

export function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const { pathname } = req.nextUrl;

  const session = token ? verifySessionToken(token) : null;
  const userId = session?.userId ?? null;

  // 1. Protected API Routes
  if (pathname.startsWith("/api")) {
    if (publicApiPaths.has(pathname)) {
      return NextResponse.next();
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Strip any client-supplied user-id header and forward authenticated request
    const requestHeaders = new Headers(req.headers);
    requestHeaders.delete("user-id");

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // 2. Protected UI Pages (e.g., /dashboard)
  if (!userId && !publicPagePaths.has(pathname)) {
    const signInUrl = new URL("/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // 3. Authenticated users visiting /signin or /signup -> redirect to /dashboard
  if (userId && (pathname === "/signin" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
