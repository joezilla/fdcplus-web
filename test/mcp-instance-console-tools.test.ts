/**
 * MCP wiring for the instance console tools: the byte-safe input path and the
 * `run_instance_command` round trip.
 *
 * The bug behind these: `write_instance_console` accepted only a string, so a
 * caller whose channel folds CR to LF could not press Enter on an emulated
 * machine — and `run_terminal_command`, the one-call alternative, hard-requires
 * a serial port. Encoding behavior lives in console-input.test.ts; the round
 * trip lives in instance-service.test.ts. This covers the schemas the model
 * actually sees.
 */

import { createMcpServer } from '../src/mcp-server';

function fakeDeps(): any {
  return {
    config: { disksDir: '/tmp/disks' },
    database: {},
    driveManager: {},
    serialManager: { isOpen: () => false, getDevice: () => null, getBaudRate: () => 0 },
    terminalManager: {},
    multiClientServing: false,
    writeMaster: 'serial',
  };
}

function toolsOf(): Record<string, any> {
  return (createMcpServer(fakeDeps()) as any)._registeredTools;
}

describe('MCP instance console tools', () => {
  test('both console tools are registered alongside the serial ones', () => {
    const names = Object.keys(toolsOf());
    expect(names).toContain('write_instance_console');
    expect(names).toContain('read_instance_console');
    expect(names).toContain('run_instance_command');
    // The serial pair still exists — the instance tools are parity, not a swap.
    expect(names).toContain('run_terminal_command');
    expect(names).toContain('send_to_terminal');
  });

  test('write_instance_console offers an exact-byte escape from text mangling', () => {
    const tool = toolsOf()['write_instance_console'];
    const shape = tool.inputSchema.shape;
    expect(Object.keys(shape).sort()).toEqual(['base64', 'bytes', 'id', 'input', 'lineEnding']);
    // `input` is no longer required — a caller may send bytes instead.
    expect(shape.input.isOptional()).toBe(true);
    expect(shape.bytes.isOptional()).toBe(true);

    // The description must name the failure mode; this wording is what steers a
    // model away from an unreliable literal CR.
    expect(tool.description).toMatch(/bytes: \[13\]/);
    expect(tool.description).toMatch(/lineEnding/);
  });

  test('run_instance_command mirrors run_terminal_command parameters', () => {
    const tools = toolsOf();
    const instance = Object.keys(tools['run_instance_command'].inputSchema.shape);
    const serial = Object.keys(tools['run_terminal_command'].inputSchema.shape);
    for (const p of serial) expect(instance).toContain(p);
    expect(instance).toContain('id');
  });

  test('the console tools accept only valid byte values', () => {
    const shape = toolsOf()['write_instance_console'].inputSchema.shape;
    expect(shape.bytes.safeParse([13]).success).toBe(true);
    expect(shape.bytes.safeParse([256]).success).toBe(false);
    expect(shape.bytes.safeParse([-1]).success).toBe(false);
    expect(shape.bytes.safeParse([1.5]).success).toBe(false);
  });

  test('a tool call against an instance-less daemon errors cleanly rather than throwing', async () => {
    const tools = toolsOf();
    const res = await tools['write_instance_console'].handler({ id: 'nope', bytes: [13] }, {} as any);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not available/i);

    const res2 = await tools['run_instance_command'].handler({ id: 'nope', text: 'DIR' }, {} as any);
    expect(res2.isError).toBe(true);
    expect(res2.content[0].text).toMatch(/not available/i);
  });
});
