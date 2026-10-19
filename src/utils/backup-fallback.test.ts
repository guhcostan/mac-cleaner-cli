import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { home } = vi.hoisted(() => ({ home: `/private/tmp/mac-cleaner-copy-${process.pid}` }));
vi.mock('os', async (original) => ({ ...await original<typeof import('os')>(), homedir: () => home }));
vi.mock('fs/promises', async (original) => {
  const fs = await original<typeof import('fs/promises')>();
  return { ...fs, rename: vi.fn(fs.rename), cp: vi.fn(fs.cp), rm: vi.fn(fs.rm) };
});
import { mkdir, readFile, writeFile, rm, rename, cp, symlink } from 'fs/promises';
import { join } from 'path';
import { backupItem, ensureBackupDir, restoreBackup, listBackups, cleanOldBackups } from './backup.js';
let path: string; let backup: string;
beforeEach(async () => { vi.clearAllMocks(); await mkdir(home, { recursive: true }); path = join(home, 'artifact'); await mkdir(path); await writeFile(join(path, 'file'), 'data'); backup = await ensureBackupDir(); });
afterEach(async () => { await rm(home, { recursive: true, force: true }); });
const item = () => ({ path, size: 4, name: 'artifact', isDirectory: true });
it('copies on EXDEV, preserves links, then restores the artifact', async () => {
  await symlink('/unfollowed', join(path, 'link'));
  vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('cross-device'), { code: 'EXDEV' }));
  expect(await backupItem(item(), backup)).toBe(true);
  expect(cp).toHaveBeenCalledWith(path, expect.any(String), expect.objectContaining({ verbatimSymlinks: true }));
  expect((await listBackups())[0].size).toBeGreaterThan(0);
  expect((await restoreBackup(backup)).success).toBe(2);
  expect(await readFile(join(path, 'file'), 'utf8')).toBe('data');
});
it('never deletes the source when copying fails', async () => {
  vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('cross-device'), { code: 'EXDEV' }));
  vi.mocked(cp).mockRejectedValueOnce(new Error('copy failed'));
  expect(await backupItem(item(), backup)).toBe(false);
  expect(await readFile(join(path, 'file'), 'utf8')).toBe('data');
  expect(rm).not.toHaveBeenCalled();
});
it('rechecks identity after a long copy before removing the source', async () => {
  vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('cross-device'), { code: 'EXDEV' }));
  const recheck = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('REPLACED'));
  expect(await backupItem(item(), backup, recheck)).toBe(false);
  expect(recheck).toHaveBeenCalledTimes(2);
  expect(await readFile(join(path, 'file'), 'utf8')).toBe('data');
  expect(rm).not.toHaveBeenCalled();
});
it('reports restore failure without losing backed-up files', async () => {
  expect(await backupItem(item(), backup)).toBe(true);
  vi.mocked(rename).mockRejectedValueOnce(new Error('permission denied'));
  const result = await restoreBackup(backup);
  expect(result.failed).toBe(1); expect(result.errors[0]).toContain('Failed to restore');
  expect((await listBackups()).length).toBe(1);
});
it('rejects restores outside the backup root and unsafe mappings', async () => {
  expect((await restoreBackup('/outside')).failed).toBe(1);
  await mkdir(join(backup, 'HOME', 'a..b'), { recursive: true });
  await writeFile(join(backup, 'HOME', 'a..b', 'file'), 'data');
  expect((await restoreBackup(backup)).errors.join()).toContain('Suspicious');
  expect(await cleanOldBackups()).toBe(0);
});
