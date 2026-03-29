/**
 * Media proxy route for Remotion rendering.
 *
 * Remotion's Chrome renderer loads media (images, video, audio) via HTTP.
 * Supabase signed URLs are HTTPS and work in local Chrome, but routing them
 * through this proxy gives a stable, controllable endpoint that works both
 * locally and in production without relying on Supabase CORS headers.
 *
 * Usage:  GET /api/proxy?src=<encoded-supabase-signed-url>
 *
 * Range requests are forwarded so video seeking works correctly in
 * Remotion's OffthreadVideo / Chrome video element.
 */

import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("src");

  if (!src) {
    return new Response("Missing required query param: src", { status: 400 });
  }

  // Forward Range header so partial-content (video seeking) works
  const upstreamHeaders: HeadersInit = {};
  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    upstreamHeaders["Range"] = rangeHeader;
  }

  let upstream: Response;
  try {
    upstream = await fetch(src, { headers: upstreamHeaders });
  } catch (err) {
    console.error("[proxy] Upstream fetch error:", src, err);
    return new Response("Upstream fetch failed", { status: 500 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    console.error("[proxy] Upstream returned", upstream.status, "for", src);
    return new Response(`Upstream returned ${upstream.status}`, {
      status: upstream.status,
    });
  }

  // Pass through the headers that matter for media streaming
  const responseHeaders = new Headers();
  const forward = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "last-modified",
    "etag",
  ] as const;
  for (const header of forward) {
    const value = upstream.headers.get(header);
    if (value) responseHeaders.set(header, value);
  }

  // Stream the body — never buffer the full file into memory
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
