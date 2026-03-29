/**
 * Local temp-file video route — used exclusively by final film assembly.
 *
 * During assembly, scene clips are downloaded to os.tmpdir()/vitae-assemble-{id}/
 * before the Remotion render starts. Remotion's OffthreadVideoServer cannot load
 * file:// URLs ("Can only download URLs starting with http:// or https://"), so
 * we serve the already-local files over HTTP through this route instead.
 *
 * Security: only files that satisfy ALL three conditions are served:
 *   1. Absolute path is under os.tmpdir()
 *   2. Immediate parent directory name starts with "vitae-assemble-"
 *   3. Extension is .mp4
 *
 * Range requests are supported so ffmpeg can seek without re-downloading.
 *
 * Usage:  GET /api/local-video?path=/tmp/vitae-assemble-xyz/clip_000.mp4
 */

import { NextRequest } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get("path");

  if (!filePath) {
    return new Response("Missing path parameter", { status: 400 });
  }

  // ── Security validation ────────────────────────────────────────────────────
  const normalizedPath = path.normalize(filePath);
  const tmpBase = path.normalize(os.tmpdir());
  const parentDir = path.basename(path.dirname(normalizedPath));

  if (
    !normalizedPath.startsWith(tmpBase) ||
    !parentDir.startsWith("vitae-assemble-") ||
    path.extname(normalizedPath).toLowerCase() !== ".mp4"
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  // ── Stat the file ──────────────────────────────────────────────────────────
  let stat: fs.Stats;
  try {
    stat = fs.statSync(normalizedPath);
  } catch {
    return new Response("File not found", { status: 404 });
  }

  const fileSize = stat.size;
  const rangeHeader = request.headers.get("range");

  // ── Range request (ffmpeg seeks into the file) ─────────────────────────────
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end   = match?.[2] ? parseInt(match[2], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    const nodeStream = fs.createReadStream(normalizedPath, { start, end });
    return new Response(
      Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>,
      {
        status: 206,
        headers: {
          "content-type": "video/mp4",
          "content-length": String(chunkSize),
          "content-range": `bytes ${start}-${end}/${fileSize}`,
          "accept-ranges": "bytes",
        },
      }
    );
  }

  // ── Full file (streamed, not buffered) ─────────────────────────────────────
  const nodeStream = fs.createReadStream(normalizedPath);
  return new Response(
    Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>,
    {
      status: 200,
      headers: {
        "content-type": "video/mp4",
        "content-length": String(fileSize),
        "accept-ranges": "bytes",
      },
    }
  );
}
