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

export const dynamic = "force-dynamic";

/**
 * Wrap a Node.js ReadStream in a Web ReadableStream.
 * Avoids Readable.toWeb() which is experimental and can silently fail
 * during Next.js App Router module evaluation, causing the route to 404.
 */
function nodeStreamToWeb(
  nodeStream: fs.ReadStream
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk) => {
        controller.enqueue(
          typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Uint8Array)
        );
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get("path");

  if (!filePath) {
    return new Response("Missing path parameter", { status: 400 });
  }

  // ── Security validation ────────────────────────────────────────────────────
  //
  // Use path.resolve() for canonical absolute path — handles mixed separators
  // (forward/back slash) and resolves any relative components. This is important
  // on Windows where os.tmpdir() and the caller may use different separator styles.
  const resolvedPath = path.resolve(filePath);
  const tmpBase = path.resolve(os.tmpdir());
  const parentDir = path.basename(path.dirname(resolvedPath));

  console.log(
    `[local-video] request: raw="${filePath}" resolved="${resolvedPath}" ` +
    `tmpBase="${tmpBase}" parentDir="${parentDir}" ext="${path.extname(resolvedPath)}"`
  );

  if (
    !resolvedPath.startsWith(tmpBase) ||
    !parentDir.startsWith("vitae-assemble-") ||
    path.extname(resolvedPath).toLowerCase() !== ".mp4"
  ) {
    console.warn(
      `[local-video] FORBIDDEN — startsTmpBase=${resolvedPath.startsWith(tmpBase)} ` +
      `startsAssemble=${parentDir.startsWith("vitae-assemble-")} ` +
      `ext=${path.extname(resolvedPath)}`
    );
    return new Response("Forbidden", { status: 403 });
  }

  // ── Stat the file ──────────────────────────────────────────────────────────
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedPath);
  } catch {
    console.error(`[local-video] NOT FOUND: "${resolvedPath}"`);
    return new Response("File not found", { status: 404 });
  }

  const fileSize = stat.size;
  const fileName = path.basename(resolvedPath);
  const rangeHeader = request.headers.get("range");

  // ── Range request (ffmpeg seeks into the file) ─────────────────────────────
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end   = match?.[2] ? parseInt(match[2], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    console.log(`[local-video] range ${start}-${end} of ${fileName} (${fileSize} bytes)`);

    return new Response(
      nodeStreamToWeb(fs.createReadStream(resolvedPath, { start, end })),
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
  console.log(`[local-video] serving ${fileName} (${fileSize} bytes)`);

  return new Response(
    nodeStreamToWeb(fs.createReadStream(resolvedPath)),
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
