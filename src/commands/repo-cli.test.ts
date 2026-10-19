import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
let home: string; let root: string;
beforeEach(async () => {
  home = await mkdtemp('/private/tmp/mac-cleaner-cli-integration-'); root = join(home, 'projects');
  await mkdir(join(root, 'target'), { recursive: true }); await writeFile(join(root, 'Cargo.toml'), ''); await writeFile(join(root, 'target/file'), 'data');
});
afterEach(async () => { await rm(home, { recursive: true, force: true }); });
function cli(args: string[]) {
  // An isolated os.homedir mock avoids reading the user's config in this subprocess.
  const source = `import { mock } from 'bun:test'; import * as os from 'os'; mock.module('os', () => ({ ...os, homedir: () => ${JSON.stringify(home)} })); process.argv = ['bun', 'mac-cleaner', ...${JSON.stringify(args)}]; await import(${JSON.stringify(resolve('src/index.ts'))});`;
  const harness = join(home, 'invoke.ts'); writeFileSync(harness, source);
  const result = spawnSync('bun', [harness], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json: () => { if (!result.stdout) throw new Error(result.stderr); return JSON.parse(result.stdout); } };
}
it('keeps scan summary keys, emits metadata and honors roots before a subcommand', () => {
  const scan = cli(['--root', root, 'scan', '--category', 'rust-artifacts', '--json', '--verbose']);
  expect(scan.status, scan.stderr + scan.stdout).toBe(0);
  expect(scan.json()).toMatchObject({ totalItems: 1, totalSize: 4, categories: [{ items: [{ path: join(root, 'target'), size: 4, fileCount: 1, id: expect.any(String), newestEntryModifiedAt: expect.any(String) }] }] });
});
it('honors global dry-run and performs real fixture-only JSON cleanup after --yes', async () => {
  const args = ['--root', root, 'clean', '--categories', 'rust-artifacts', '--json'];
  const simulated = cli(['--dry-run', ...args]);
  expect(simulated.status, simulated.stderr + simulated.stdout).toBe(0); expect(simulated.json()).toMatchObject({ totalCleanedItems: 0, wouldCleanItems: 1 });
  expect(await readFile(join(root, 'target/file'), 'utf8')).toBe('data');
  const actual = cli([...args, '--yes']);
  expect(actual.status).toBe(0); expect(actual.json()).toMatchObject({ totalCleanedItems: 1, totalFreedSpace: 4 });
});
it('emits one JSON failure for malformed keep policy and incompatible live flags', () => {
  const bad = cli(['clean', '--root', root, '--categories', 'rust-artifacts', '--json', '--dry-run', '--exclude', '../bad']);
  expect(bad.status).toBe(1); expect(bad.json().errors[0].error).toBe('INVALID_EXCLUSIONS');
  const live = cli(['--live', 'clean', '--all', '--json', '--dry-run']);
  expect(live.status).toBe(1); expect(live.json().errors[0].error).toContain('--live and --json');
});


it('simulates configured backup without creating a session directory', async () => {
  await writeFile(join(home, '.maccleanerrc'), JSON.stringify({ backupEnabled: true }));
  const result = cli(['clean', '--root', root, '--categories', 'rust-artifacts', '--json', '--dry-run']);
  expect(result.status).toBe(0);
  expect(result.json()).toMatchObject({ totalFreedSpace: 0, totalBackedUpSize: 0, totalCleanedItems: 0, wouldBackUpSize: 4 });
  await expect(readFile(join(home, '.mac-cleaner-cli'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readFile(join(root, 'target/file'), 'utf8')).toBe('data');
});
