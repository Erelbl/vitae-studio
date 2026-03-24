/**
 * appendMp3Silence — appends real silent MPEG1 Layer3 frames to an MP3 buffer.
 *
 * WHY SILENCE MUST BE IN THE FILE
 * ───────────────────────────────
 * ElevenLabs' streaming encoder ends the file immediately at the last speech
 * frame. MPEG Layer3 decoders need to flush an internal delay buffer (encoder
 * delay ≈ 576 samples, decoder lookahead ≈ 1152 samples) AFTER the last frame.
 * When no frames follow, strict decoders (QuickTime, Windows Media Player, some
 * mobile players) discard those unflushed samples — which are the very last few
 * milliseconds of speech — producing the "last word cut off" symptom.
 *
 * Adding physical silence frames after the speech gives every decoder room to
 * finish flushing without losing real audio. The browser's <audio> element is
 * lenient and plays everything already; all other players now do the same.
 *
 * HOW SILENT FRAMES ARE CONSTRUCTED
 * ──────────────────────────────────
 * Each silent frame is a valid MPEG1 L3 frame whose side-information is all
 * zeros. All-zero side info means:
 *   • main_data_begin = 0  → no data from the bit reservoir
 *   • part2_3_length  = 0  → decoder reads zero main-data bits for every granule
 *   • big_values      = 0  → all spectral coefficients are zero
 *   • global_gain     = 0  → amplitude scale is 2^(-52.5) ≈ 0
 * The decoder therefore outputs zero samples (silence) without artefacts.
 *
 * Frame properties (bitrate, sample rate, channel mode) are copied from the
 * first real frame of the source buffer so the silence is format-compatible.
 * The protection bit is forced to 1 (no CRC) since silence frames carry no
 * audio to protect. Padding bit is always 0.
 *
 * CALL ORDER
 * ──────────
 * Call appendMp3Silence BEFORE patchMp3XingFrameCount so that the Xing header
 * frame count is updated to include the silence frames and all players compute
 * the correct total duration.
 */

// MPEG1 Layer3 bitrate table (index → kbps; 0 and 15 are invalid/free)
const MPEG1_L3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
// MPEG1 sample-rate table (index → Hz; index 3 is reserved)
const MPEG1_SRATES  = [44100, 48000, 32000, 0];
// Samples per MPEG1 Layer3 frame (constant)
const SAMPLES_PER_FRAME = 1152;

/**
 * Returns a new buffer with `silenceDurationMs` of real silence appended.
 *
 * Returns the original buffer unchanged if:
 *   • silenceDurationMs ≤ 0
 *   • no valid MPEG1 L3 frame sync is found in the source
 *   • the parsed bitrate or sample rate is invalid
 */
export function appendMp3Silence(buffer: Buffer, silenceDurationMs: number): Buffer {
  if (silenceDurationMs <= 0) return buffer;

  // ── find first valid MPEG1 L3 frame ───────────────────────────────────────
  let scanStart = 0;
  // Skip ID3v2 tag if present ("ID3" magic at offset 0)
  if (
    buffer.length >= 10 &&
    buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33
  ) {
    const tagSize =
      ((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) |
      ((buffer[8] & 0x7f) << 7)  |  (buffer[9] & 0x7f);
    scanStart = 10 + tagSize;
  }

  let framePos = -1;
  for (let i = scanStart; i < buffer.length - 3; i++) {
    if (buffer[i] !== 0xff || (buffer[i + 1] & 0xe0) !== 0xe0) continue;
    const version = (buffer[i + 1] >> 3) & 0x03;
    const layer   = (buffer[i + 1] >> 1) & 0x03;
    if (version === 0x03 && layer === 0x01) { framePos = i; break; }
  }
  if (framePos < 0) return buffer; // unrecognised format — leave as-is

  const h1 = buffer[framePos + 1]; // sync low byte + MPEG version + layer + protection
  const h2 = buffer[framePos + 2]; // bitrate index + sample-rate index + padding + private
  const h3 = buffer[framePos + 3]; // channel mode + mode extension + copyright + original + emphasis

  const bitrateKbps = MPEG1_L3_KBPS[(h2 >> 4) & 0x0f];
  const sampleRate  = MPEG1_SRATES[(h2 >> 2) & 0x03];

  if (!bitrateKbps || !sampleRate) return buffer;

  // ── compute how many silence frames to generate ───────────────────────────
  const msPerFrame   = (SAMPLES_PER_FRAME / sampleRate) * 1000; // ≈ 26.12 ms at 44.1 kHz
  const framesNeeded = Math.ceil(silenceDurationMs / msPerFrame);

  // MPEG1 L3 frame length (bytes) = floor(144 × bitrate_bps / sample_rate) + padding_bit
  // For silence we always use padding=0, so:
  const frameSize = Math.floor(144 * bitrateKbps * 1000 / sampleRate);
  if (frameSize < 24) return buffer; // sanity guard

  // ── build silence block ───────────────────────────────────────────────────
  //
  // Each frame occupies exactly frameSize bytes laid out as:
  //
  //   Offset  Width  Value
  //   ──────  ─────  ──────────────────────────────────────────────────
  //     0       1    0xFF                    frame sync high byte
  //     1       1    h1 | 0x01              sync low + MPEG1 + L3 + protection=1 (no CRC)
  //     2       1    h2 & 0xFD              same bitrate/samplerate, padding=0 (bit 1 cleared)
  //     3       1    h3                     same channel mode / emphasis
  //     4+     32    0x00 (stereo)          side info: main_data_begin=0, part2_3_length=0
  //            17    0x00 (mono)            → decoder produces zero output (silence)
  //   rest     …    0x00                   main data: no spectral coefficients to read
  //
  // Buffer.alloc fills with 0 by default, so only the 4-byte header needs writing.
  const silence = Buffer.alloc(framesNeeded * frameSize, 0);
  for (let i = 0; i < framesNeeded; i++) {
    const off        = i * frameSize;
    silence[off]     = 0xff;
    silence[off + 1] = h1 | 0x01;    // force protection=1 (no CRC bytes expected)
    silence[off + 2] = h2 & 0xfd;    // 0xFD = ~0x02: clear padding bit, keep all else
    silence[off + 3] = h3;           // preserve channel mode, emphasis, etc.
    // bytes [off+4 … off+frameSize-1] remain 0x00 (side info + main data = silence)
  }

  const actualMs = Math.round(framesNeeded * msPerFrame);
  console.log(
    `[mp3-silence] +${framesNeeded} silent frames = ${actualMs} ms ` +
    `(${framesNeeded * frameSize} bytes); ` +
    `file: ${buffer.length} → ${buffer.length + silence.length} bytes`
  );

  return Buffer.concat([buffer, silence]);
}
