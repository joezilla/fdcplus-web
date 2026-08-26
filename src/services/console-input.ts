/**
 * Console input encoding — one payload shape for every "send keystrokes"
 * surface (the serial terminal tools, the instance console tool, the REST
 * console route).
 *
 * Why a byte path exists at all: a caller reaching us over a text channel
 * cannot always emit a literal CR (0x0D) — some transports fold it to LF on the
 * way out, which an 8-bit monitor's line editor silently ignores, so the
 * command never executes. Two independent escapes from that:
 *
 *   - `bytes` / `base64` — exact byte values, never touched by line-ending
 *     conversion. `bytes: [13]` is Enter, full stop.
 *   - `lineEnding: 'cr'` on `text` — `convertLineEndings` rewrites a stray LF
 *     *back* into CR server-side, so a mangled CR repairs itself.
 */

import { convertLineEndings, LineEnding } from '../replay-engine';
import { ServiceError } from './service-error';

export { LineEnding };

/** A keystroke payload: exactly one of `text`, `bytes`, or `base64`. */
export interface ConsoleInput {
  /** Characters to send. Subject to `lineEnding` conversion. */
  text?: string;
  /** Exact byte values (0–255) — immune to text-channel mangling. */
  bytes?: number[];
  /** Exact bytes as base64 — the same guarantee as `bytes`, for longer payloads. */
  base64?: string;
  /** Line ending applied to `text` only. Ignored for `bytes`/`base64`. */
  lineEnding?: LineEnding;
}

const LINE_ENDINGS: LineEnding[] = ['cr', 'lf', 'crlf', 'raw'];

const TERMINATORS: Record<Exclude<LineEnding, 'raw'>, Buffer> = {
  cr: Buffer.from([0x0d]),
  lf: Buffer.from([0x0a]),
  crlf: Buffer.from([0x0d, 0x0a]),
};

/**
 * Encode a console payload to the exact bytes to deliver.
 *
 * `text` has its line endings converted to `lineEnding` (defaulting to
 * `defaultMode`) and gains a trailing terminator when it lacks one, so a bare
 * `"DIR"` executes. `bytes`/`base64` pass through verbatim — they are already
 * exact, and converting them would corrupt binary keystrokes.
 */
export function encodeConsoleInput(input: ConsoleInput, defaultMode: LineEnding): Buffer {
  const provided = (['text', 'bytes', 'base64'] as const).filter((k) => input[k] !== undefined);
  if (provided.length === 0) {
    throw new ServiceError('One of `text`, `bytes`, or `base64` is required', 400);
  }
  if (provided.length > 1) {
    throw new ServiceError(
      `Provide only one of \`text\`, \`bytes\`, or \`base64\` (got ${provided.join(', ')})`,
      400,
    );
  }

  if (input.bytes !== undefined) {
    if (!Array.isArray(input.bytes)) {
      throw new ServiceError('`bytes` must be an array of integers 0–255', 400);
    }
    for (const b of input.bytes) {
      if (!Number.isInteger(b) || b < 0 || b > 255) {
        throw new ServiceError(`\`bytes\` must be integers 0–255 (got ${b})`, 400);
      }
    }
    return Buffer.from(input.bytes);
  }

  if (input.base64 !== undefined) {
    if (typeof input.base64 !== 'string') {
      throw new ServiceError('`base64` must be a string', 400);
    }
    const buf = Buffer.from(input.base64, 'base64');
    // Buffer.from silently drops invalid base64 rather than throwing; a payload
    // that decodes to nothing is a caller mistake worth naming.
    if (buf.length === 0 && input.base64.length > 0) {
      throw new ServiceError('`base64` is not valid base64', 400);
    }
    return buf;
  }

  const mode = input.lineEnding ?? defaultMode;
  if (!LINE_ENDINGS.includes(mode)) {
    throw new ServiceError(`\`lineEnding\` must be one of ${LINE_ENDINGS.join(', ')} (got ${mode})`, 400);
  }
  if (typeof input.text !== 'string') {
    throw new ServiceError('`text` must be a string', 400);
  }
  let buf = convertLineEndings(Buffer.from(input.text), mode);
  if (mode !== 'raw') {
    // convertLineEndings only rewrites existing newlines — it never appends one,
    // so a bare "DIR" would sit in the line editor unexecuted.
    const terminator = TERMINATORS[mode];
    if (!buf.subarray(-terminator.length).equals(terminator)) {
      buf = Buffer.concat([buf, terminator]);
    }
  }
  return buf;
}
