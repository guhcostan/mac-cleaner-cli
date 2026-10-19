import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { join } from 'path';
const { home } = vi.hoisted(() => ({ home: `/private/tmp/mac-cleaner-desktop-repo-${process.pid}` }));
vi.mock('os', async (original) => ({ ...await original<typeof import('os')>(), homedir: () => home }));
import { RustArtifactsScanner } from '../../../src/scanners/rust-artifacts.js';
import { clearConfigCache } from '../../../src/utils/config.js';
import { CleanerController } from './controller.js';
import { Store } from './store.js';

const root = join(home, 'projects');
beforeEach(async () => {
  clearConfigCache();
  await mkdir(root, { recursive: true });
  await writeFile(join(home, '.maccleanerrc'), JSON.stringify({ extraPaths: { projects: [root] }, backupEnabled: true }));
});
afterEach(async () => { clearConfigCache(); await rm(home, { recursive: true, force: true }); });

async function artifact(name: string) {
  const path = join(root, name, 'target');
  await mkdir(path, { recursive: true });
  await writeFile(join(root, name, 'Cargo.toml'), '');
  await writeFile(join(path, 'output'), 'hello');
  return path;
}
async function setup() {
  const store = await Store.open(join(home, 'state'));
  const controller = new CleanerController({ store, registry: { 'rust-artifacts': new RustArtifactsScanner() }, version: 'fixture' });
  return { store, controller };
}

it('carries the deep preview through real validation and permanent fixture cleanup without discovering new items', async () => {
  const valid = await artifact('valid');
  const changed = await artifact('changed');
  const { controller } = await setup();
  const preview = await controller.scanDeep(['rust-artifacts']);
  expect(preview.totalSize).toBe(10);
  expect(preview.categories[0].topItems[0]).toMatchObject({ id: expect.any(String), fileCount: 1, newestEntryModifiedAt: expect.any(String) });
  const unseen = await artifact('created-after-preview');
  await rm(join(root, 'changed/Cargo.toml'));
  const record = await controller.cleanDeep(['rust-artifacts']);
  expect(record.cleanedItems).toBe(1);
  expect(record.freedSpace).toBe(5);
  expect(record.categories[0].errors.join()).toContain('MARKER_MISSING');
  await expect(stat(valid)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readFile(join(changed, 'output'), 'utf8')).toBe('hello');
  expect(await readFile(join(unseen, 'output'), 'utf8')).toBe('hello');
  await expect(stat(join(home, '.mac-cleaner-cli/backup'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('blocks new repository categories in quick cleanup even if settings bypass normal validation', async () => {
  const path = await artifact('keep');
  const { controller, store } = await setup();
  store.settings.autoClean.categories = ['rust-artifacts', 'node-build-artifacts', 'go-artifacts'];
  const record = await controller.runQuickClean();
  expect(record.cleanedItems).toBe(0);
  expect(record.categories).toEqual([]);
  expect(await readFile(join(path, 'output'), 'utf8')).toBe('hello');
});
