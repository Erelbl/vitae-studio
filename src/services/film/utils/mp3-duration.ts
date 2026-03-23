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

  const tag = buf.slice(xOff, xOff + 4).toString("latin1");
  if (tag !== "Xing" && tag !== "Info") return null;

  // Flags field: bit 0 = number-of-frames field is present
  const flags = buf.readUInt32BE(xOff + 4);
  if (!(flags & 0x01)) return null;

  const numFrames = buf.readUInt32BE(xOff + 8);
  return numFrames > 0 ? numFrames : null;
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
