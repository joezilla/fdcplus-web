/**
 * Tests for console input encoding — the shared payload shape behind
 * `send_to_terminal`, `run_terminal_command`, `write_instance_console`,
 * `run_instance_command`, and POST /api/instances/:id/console.
 *
 * The motivating bug: a caller whose text channel folds CR to LF could not
 * press Enter on an emulated machine. Both escapes from that (exact `bytes`,
 * and server-side LF→CR repair via `lineEnding: 'cr'`) are covered here.
 */

import { encodeConsoleInput } from '../src/services/console-input';
import { ServiceError } from '../src/services/service-error';

const bytes = (b: Buffer) => [...b];

describe('encodeConsoleInput — exact byte payloads', () => {
  test('`bytes` passes through verbatim — [13] is Enter', () => {
    expect(bytes(encodeConsoleInput({ bytes: [13] }, 'cr'))).toEqual([13]);
  });

  test('`bytes` is never line-ending converted, even under a cr default', () => {
    // 0x0A here is a deliberate byte, not a newline to be rewritten.
    expect(bytes(encodeConsoleInput({ bytes: [0x44, 0x0a, 0x00, 0xff] }, 'cr')))
      .toEqual([0x44, 0x0a, 0x00, 0xff]);
  });

  test('`base64` decodes to the same exact bytes', () => {
    expect(bytes(encodeConsoleInput({ base64: Buffer.from([13]).toString('base64') }, 'cr')))
      .toEqual([13]);
  });

  test('an empty `bytes` array sends nothing rather than erroring', () => {
    expect(bytes(encodeConsoleInput({ bytes: [] }, 'cr'))).toEqual([]);
  });
});

describe('encodeConsoleInput — text and line endings', () => {
  test('a bare command gains exactly one CR so the line editor executes it', () => {
    expect(bytes(encodeConsoleInput({ text: 'DIR', lineEnding: 'cr' }, 'raw')))
      .toEqual([0x44, 0x49, 0x52, 0x0d]);
  });

  test('a command that already ends in CR is not double-terminated', () => {
    expect(bytes(encodeConsoleInput({ text: 'DIR\r', lineEnding: 'cr' }, 'raw')))
      .toEqual([0x44, 0x49, 0x52, 0x0d]);
  });

  test('a CR mangled to LF upstream is repaired server-side', () => {
    // The reported symptom: the caller meant CR, the channel delivered LF.
    expect(bytes(encodeConsoleInput({ text: 'DIR\n', lineEnding: 'cr' }, 'raw')))
      .toEqual([0x44, 0x49, 0x52, 0x0d]);
  });

  test('empty text with cr is a bare Enter', () => {
    expect(bytes(encodeConsoleInput({ text: '', lineEnding: 'cr' }, 'raw'))).toEqual([0x0d]);
  });

  test('lf and crlf terminate as asked', () => {
    expect(bytes(encodeConsoleInput({ text: 'A', lineEnding: 'lf' }, 'raw'))).toEqual([0x41, 0x0a]);
    expect(bytes(encodeConsoleInput({ text: 'A', lineEnding: 'crlf' }, 'raw')))
      .toEqual([0x41, 0x0d, 0x0a]);
  });

  test('raw is byte-identical — nothing converted, nothing appended', () => {
    expect(bytes(encodeConsoleInput({ text: 'DIR\n', lineEnding: 'raw' }, 'cr')))
      .toEqual([0x44, 0x49, 0x52, 0x0a]);
  });

  test('the default mode applies when lineEnding is omitted', () => {
    expect(bytes(encodeConsoleInput({ text: 'DIR' }, 'cr'))).toEqual([0x44, 0x49, 0x52, 0x0d]);
    expect(bytes(encodeConsoleInput({ text: 'DIR' }, 'raw'))).toEqual([0x44, 0x49, 0x52]);
  });
});

describe('encodeConsoleInput — rejections', () => {
  const expectBadRequest = (fn: () => unknown) => {
    try {
      fn();
      throw new Error('expected a ServiceError');
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect((err as ServiceError).statusCode).toBe(400);
    }
  };

  test('no input field at all', () => {
    expectBadRequest(() => encodeConsoleInput({}, 'cr'));
  });

  test('more than one input field', () => {
    expectBadRequest(() => encodeConsoleInput({ text: 'DIR', bytes: [13] }, 'cr'));
  });

  test('out-of-range and non-integer bytes', () => {
    expectBadRequest(() => encodeConsoleInput({ bytes: [256] }, 'cr'));
    expectBadRequest(() => encodeConsoleInput({ bytes: [-1] }, 'cr'));
    expectBadRequest(() => encodeConsoleInput({ bytes: [1.5] }, 'cr'));
  });

  test('untyped REST bodies: bytes that is not an array, base64 that is not a string', () => {
    expectBadRequest(() => encodeConsoleInput({ bytes: 13 as unknown as number[] }, 'cr'));
    expectBadRequest(() => encodeConsoleInput({ base64: 13 as unknown as string }, 'cr'));
  });

  test('undecodable base64', () => {
    expectBadRequest(() => encodeConsoleInput({ base64: '!!!!' }, 'cr'));
  });

  test('an unknown lineEnding', () => {
    expectBadRequest(() =>
      encodeConsoleInput({ text: 'DIR', lineEnding: 'nl' as never }, 'cr'));
  });
});
