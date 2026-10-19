import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn } from 'child_process';
vi.mock('child_process', () => ({ spawn: vi.fn() }));
import { gitQuery } from './eligibility.js';
let child: EventEmitter & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough; kill: ReturnType<typeof vi.fn> };
beforeEach(() => {
  child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
  vi.mocked(spawn).mockReturnValue(child as never);
});
afterEach(() => { child.emit('close', 1); vi.useRealTimers(); vi.unstubAllEnvs(); });
it('uses argument arrays and removes inherited Git routing', async () => {
  vi.stubEnv('GIT_INDEX_FILE', '/wrong/index'); vi.stubEnv('GIT_DIR', '/wrong/git');
  const pending = gitQuery('/fixture', ['ls-files', '-z']);
  const [, args, options] = vi.mocked(spawn).mock.calls.at(-1)!;
  expect(args).toEqual(['-C', '/fixture', 'ls-files', '-z']);
  expect(options?.env?.GIT_INDEX_FILE).toBeUndefined(); expect(options?.env?.GIT_DIR).toBeUndefined();
  child.stdout.write('a\tb\nc\0'); child.emit('close', 0);
  expect((await pending).output).toBe('a\tb\nc\0');
});
it('bounds subprocess output', async () => {
  const pending = gitQuery('/fixture', ['ls-files', '-z']);
  const rejection = expect(pending).rejects.toThrow('GIT_UNKNOWN');
  child.stdout.write(Buffer.alloc(16 * 1024 * 1024 + 1));
  await rejection; expect(child.kill).toHaveBeenCalledWith('SIGKILL');
});
it('fails closed on timeout without waiting in real time', async () => {
  vi.useFakeTimers();
  const pending = gitQuery('/fixture', ['ls-files', '-z']);
  const rejection = expect(pending).rejects.toThrow('GIT_UNKNOWN');
  await vi.advanceTimersByTimeAsync(10001); await rejection;
  expect(child.kill).toHaveBeenCalledWith('SIGKILL');
});
it('cancels an in-flight Git process', async () => {
  const abort = new AbortController(); const pending = gitQuery('/fixture', ['ls-files'], '', undefined, abort.signal);
  const rejection = expect(pending).rejects.toThrow('CANCELLED'); abort.abort(); await rejection;
});


it('fails closed on undecodable path bytes', async () => {
  const pending = gitQuery('/fixture', ['ls-files', '-z']);
  const rejection = expect(pending).rejects.toThrow('GIT_UNKNOWN');
  child.stdout.write(Buffer.from([0xff, 0])); child.emit('close', 0); await rejection;
});
