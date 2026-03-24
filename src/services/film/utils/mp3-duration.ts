/**
 * getMp3DurationMs — pure-JS MP3 audio duration parser.
 *
 * Strategy:
 *  1. Skip any ID3v2 tag at the start of the buffer.
 *  2. Scan forward to the first valid MPEG1 Layer3 sync frame.
 *  3. Look for a Xing/Info VBR header immediately after the frame header.
 *     – If found with a valid frame count: duration = frames × 1152 / sampleRate.
 *     – This is the only reliable path for VBR audio (ElevenLabs eleven_v3 uses VBR
 *       even when the requested format is "mp3_44100_128").
 *  4. Fallback (no VBR header = CBR): duration = audioBytes × 8 / bitrate.
 *     – "audioBytes" is counted from the first frame sync, skipping the ID3 tag.
 *  5. If any step throws or produces 0, fall back to the 16 000 bytes/sec heuristic
 *     that was used before. That fallback is wrong for VBR but is never worse than
 *     the old behaviour, and it will never be reached for well-formed ElevenLabs output.
 *
 * All arithmetic is integer-safe for files up to ~2 GB.
 */

// MPEG1 Layer3 bitrate table (index → kbps; 0 and 15 are invalid/free)
const MPEG1_L3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];

// MPEG1 sample-rate table (index → Hz; index 3 is reserved)
const MPEG1_SAMPLE_RATES = [44100, 48000, 32000, 0];

// Samples per MPEG1 Layer3 frame (always 1152)
const SAMPLES_PER_FRAME = 1152;

// ── helpers ──────────────────────────────────────────────────────────────────

/** Returns byte offset after an ID3v2 tag, or `start` if none is present. */
function skipId3v2(buf: Buffer, start: number): number {
  if (buf.length - start < 10) return start;
  if (buf[start] !== 0x49 || buf[start + 1] !== 0x44 || buf[start + 2] !== 0x33) return start;
  // Size is a 28-bit syncsafe integer (7 bits per byte, big-endian)
  const size =
    ((buf[start + 6] & 0x7f) << 21) |
    ((buf[start + 7] & 0x7f) << 14) |
    ((buf[start + 8] & 0x7f) << 7) |
     (buf[start + 9] & 0x7f);
  return start + 10 + size;
}

/**
 * Scans forward from `offset` to find the first MPEG1 Layer3 frame sync word.
 * Returns the byte offset of the sync word, or -1 if not found.
 */
function findFrameSync(buf: Buffer, offset: number): number {
  const limit = buf.length - 4;
  for (let i = offset; i < limit; i++) {
    // Sync word: 0xFF followed by 0xEx or 0xFx (top 11 bits all set)
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
    // Must be MPEG1 (versionBits = 0x03) and Layer3 (layerBits = 0x01)
    const versionBits = (buf[i + 1] >> 3) & 0x03;
    const layerBits   = (buf[i + 1] >> 1) & 0x03;
    if (versionBits === 0x03 && layerBits === 0x01) return i;
  }
  return -1;
}

interface FrameInfo {
  bitrateKbps: number;
  sampleRate: number;
  isMono: boolean;
}

/** Parses bitrate, sample-rate, and channel mode from a 4-byte frame header. */
function parseFrameHeader(buf: Buffer, offset: number): FrameInfo | null {
  if (offset + 4 > buf.length) return null;

  const b2 = buf[offset + 2];
  const b3 = buf[offset + 3];

  const bitrateKbps  = MPEG1_L3_KBPS[(b2 >> 4) & 0x0f];
  const sampleRate   = MPEG1_SAMPLE_RATES[(b2 >> 2) & 0x03];
  const channelMode  = (b3 >> 6) & 0x03; // 0b11 = mono

  if (!bitrateKbps || !sampleRate) return null;

  return { bitrateKbps, sampleRate, isMono: channelMode === 3 };
}

/**
 * Looks for a Xing or Info VBR header in the first frame.
 *
 * Location: 4 (frame header) + side-info bytes after `frameOffset`.
 *   MPEG1 stereo → 32 bytes of side info
 *   MPEG1 mono   → 17 bytes of side info
 *
 * Returns the total frame count if the header is valid and includes it,
 * otherwise returns null.
 */
function readXingFrameCount(buf: Buffer, frameOffset: number, isMono: boolean): number | null {
  const sideInfoLen = isMono ? 17 : 32;
  const xOff = frameOffset + 4 + sideInfoLen;

  if (xOff + 12 > buf.length) return null;

  const tag = buf.subarray(xOff, xOff + 4).toString("latin1");
  if (tag !== "Xing" && tag !== "Info") return null;

  // Flags field: bit 0 = number-of-frames field is present
  const flags = buf.readUInt32BE(xOff + 4);
  if (!(flags & 0x01)) return null;

  const numFrames = buf.readUInt32BE(xOff + 8);
  return numFrames > 0 ? numFrames : null;
}

// ── frame scanner ─────────────────────────────────────────────────────────────

/**
 * Counts every MPEG1 Layer3 frame in `buf` starting at `startOffset` by
 * walking the buffer one frame at a time using the frame-length formula.
 *
 * This is O(n) in the number of bytes but only called once per TTS response,
 * and typical narration files are < 1 MB so the cost is negligible.
 */
function countActualMp3Frames(buf: Buffer, startOffset: number): number {
  let count = 0;
  let pos = startOffset;

  while (pos < buf.length - 3) {
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) {
      // No sync here — step by 1 byte to resync (shouldn't happen in valid files)
      pos++;
      continue;
    }

    const versionBits = (buf[pos + 1] >> 3) & 0x03;
    const layerBits   = (buf[pos + 1] >> 1) & 0x03;
    if (versionBits !== 0x03 || layerBits !== 0x01) {
      pos++;
      continue;
    }

    const bitrateIdx = (buf[pos + 2] >> 4) & 0x0f;
    const srateIdx   = (buf[pos + 2] >> 2) & 0x03;
    const padding    = (buf[pos + 2] >> 1) & 0x01;

    const bitrateKbps = MPEG1_L3_KBPS[bitrateIdx];
    const sampleRate  = MPEG1_SAMPLE_RATES[srateIdx];

    if (!bitrateKbps || !sampleRate) {
      pos++;
      continue;
    }

    // MPEG1 L3 frame length = floor(144 × bitrate / sample_rate) + padding_bit
    const frameLen = Math.floor(144 * bitrateKbps * 1000 / sampleRate) + padding;
    if (frameLen < 24) { pos++; continue; } // sanity guard

    count++;
    pos += frameLen;
  }

  return count;
}

/**
 * Patches the Xing/Info VBR header frame-count field to match the actual number
 * of frames found by scanning the buffer.
 *
 * WHY THIS EXISTS
 * ──────────────
 * ElevenLabs uses a streaming MP3 encoder. The Xing header (always the very
 * first frame) must be written before encoding is complete; the encoder fills in
 * the total frame count at encode-start based on an estimate, then streams audio
 * frames. In a streaming HTTP response it can never seek back to correct that
 * count. The result: the stored Xing frame count is often lower than the actual
 * number of frames in the file.
 *
 * Consequence:
 *   • The browser's <audio> element scans sync words in its stream buffer and
 *     plays every frame it finds → on-site playback sounds complete.
 *   • Desktop media players (VLC, QuickTime, Windows Media Player, …) trust the
 *     Xing frame count, decode exactly that many frames, and then stop → the
 *     last word is cut off in the downloaded file.
 *
 * Fix: count real frames by walking the buffer, then overwrite the 4-byte frame-
 * count field in the Xing header so every player gets the same answer.
 * The audio data itself is never touched.
 *
 * @returns The (possibly patched) buffer and diagnostic counts.
 */
export function patchMp3XingFrameCount(buffer: Buffer): {
  buffer: Buffer;
  /** Frame count recorded in the Xing/Info header before patching; null if absent. */
  xingCount: number | null;
  /** True frame count found by scanning the entire buffer. */
  actualCount: number;
  /** Whether the buffer was modified. */
  patched: boolean;
} {
  try {
    const afterId3  = skipId3v2(buffer, 0);
    const frameSync = findFrameSync(buffer, afterId3);
    if (frameSync < 0) return { buffer, xingCount: null, actualCount: 0, patched: false };

    const frame = parseFrameHeader(buffer, frameSync);
    if (!frame) return { buffer, xingCount: null, actualCount: 0, patched: false };

    const xingCount   = readXingFrameCount(buffer, frameSync, frame.isMono);
    const actualCount = countActualMp3Frames(buffer, frameSync);

    if (xingCount === null) {
      // No Xing/Info header (pure CBR) — players will scan frames directly; no patch needed
      return { buffer, xingCount: null, actualCount, patched: false };
    }

    if (xingCount === actualCount) {
      return { buffer, xingCount, actualCount, patched: false };
    }

    // Counts differ — patch the 4-byte frame-count field in the Xing header
    const sideInfoLen = frame.isMono ? 17 : 32;
    const xOff = frameSync + 4 + sideInfoLen; // offset of "Xing"/"Info" tag

    if (xOff + 12 > buffer.length) {
      // Cannot safely write — return as-is
      return { buffer, xingCount, actualCount, patched: false };
    }

    const patched = Buffer.from(buffer); // copy — do NOT mutate the original
    patched.writeUInt32BE(actualCount, xOff + 8); // frame count is at offset +8 within Xing header

    return { buffer: patched, xingCount, actualCount, patched: true };
  } catch {
    return { buffer, xingCount: null, actualCount: 0, patched: false };
  }
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Returns the true playback duration of an MP3 buffer in milliseconds.
 *
 * Accurate for both CBR and VBR (including ElevenLabs VBR output).
 * Falls back to the legacy 16 000 bytes/sec heuristic on parse failure.
 */
export function getMp3DurationMs(buffer: Buffer): number {
  try {
    const afterId3 = skipId3v2(buffer, 0);
    const frameSync = findFrameSync(buffer, afterId3);
    if (frameSync < 0) return legacyEstimate(buffer.length);

    const frame = parseFrameHeader(buffer, frameSync);
    if (!frame) return legacyEstimate(buffer.length);

    // ── VBR path (Xing / Info header) ────────────────────────────────────
    const vbrFrames = readXingFrameCount(buffer, frameSync, frame.isMono);
    if (vbrFrames !== null) {
      // Exact: total samples ÷ sample rate
      const durationMs = Math.round((vbrFrames * SAMPLES_PER_FRAME / frame.sampleRate) * 1000);
      if (durationMs > 0) return durationMs;
    }

    // ── CBR path ─────────────────────────────────────────────────────────
    // Duration = audio bytes (from first frame) × 8 ÷ bitrate (in bps)
    const audioBytesFromSync = buffer.length - frameSync;
    const durationMs = Math.round((audioBytesFromSync * 8 / (frame.bitrateKbps * 1000)) * 1000);
    if (durationMs > 0) return durationMs;

    return legacyEstimate(buffer.length);
  } catch {
    return legacyEstimate(buffer.length);
  }
}

/** Legacy fallback: assumes 128 kbps CBR = 16 000 bytes/sec. */
function legacyEstimate(bufferLength: number): number {
  return Math.max(500, Math.round((bufferLength / 16000) * 1000));
}
