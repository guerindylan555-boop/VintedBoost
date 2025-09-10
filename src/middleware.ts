import { NextResponse, NextRequest } from "next/server";

// Protect the app: require a Better Auth session cookie for all pages
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Redirect root to /creer
  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/creer";
    return NextResponse.redirect(url);
  }

  // Allow public routes and Next internals/static assets
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public/") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/creer") ||
    pathname.startsWith("/resultats")
  ) {
    return NextResponse.next();
  }

  // Basic static file extension check
  if (/\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|json|woff2?|ttf)$/i.test(pathname)) {
    return NextResponse.next();
  }

  // Better Auth session cookies (secure prefix may be applied in production)
  const sessionCookie =
    req.cookies.get("__Secure-better-auth.session_token")?.value ||
    req.cookies.get("better-auth.session_token")?.value;

  if (sessionCookie) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/auth";
  url.searchParams.set("next", pathname + (req.nextUrl.search || ""));
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except the Better Auth API and Next internals
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
};
