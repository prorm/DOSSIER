import { NextResponse, type NextRequest } from "next/server";

/**
 * Security headers for every document and API response.
 *
 * CSP: scripts are nonce-gated with 'strict-dynamic' (no inline script
 * without the per-request nonce, no third-party origins). Styles allow
 * 'unsafe-inline' because React style attributes and component-scoped
 * <style> blocks need it; style injection cannot execute script under this
 * policy. No external origins are allowed at all: fonts are self-hosted by
 * next/font, images/assets come from our own signed asset route.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const https = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "media-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const h = response.headers;
  // Asset, artifact and synthetic-site responses set their own (stricter, isolated) CSP.
  const own = ["/api/assets/", "/api/artifacts/", "/x/"].some((p) => request.nextUrl.pathname.startsWith(p));
  if (!own) h.set("content-security-policy", csp);
  h.set("x-content-type-options", "nosniff");
  h.set("x-frame-options", "DENY");
  // same-origin: signed asset URLs never leak to third parties through Referer.
  h.set("referrer-policy", "same-origin");
  // Camera: volunteer badge scanner. Geolocation: GPS checkpoints. Both on our own origin only.
  h.set("permissions-policy", "camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()");
  h.set("cross-origin-opener-policy", "same-origin");
  h.set("cross-origin-resource-policy", "same-origin");
  if (https) h.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
