import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { MailAttachmentsScanner } from './mail-attachments.js';
import * as paths from '../utils/paths.js';

describe('MailAttachmentsScanner', () => {
  let testDir: string;
  let scanner: MailAttachmentsScanner;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'clean-my-mac-mail-test-'));
    scanner = new MailAttachmentsScanner();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('mail-attachments');
    expect(scanner.category.name).toBe('Mail Attachments');
    expect(scanner.category.group).toBe('Storage');
    expect(scanner.category.safetyLevel).toBe('risky');
  });

  it('should scan mail attachments directory', async () => {
    const mailDir = join(testDir, 'Mail Downloads');
    await mkdir(mailDir, { recursive: true });
    await writeFile(join(mailDir, 'attachment1.pdf'), 'pdf content');
    await writeFile(join(mailDir, 'attachment2.docx'), 'docx content');

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      mailDownloads: mailDir,
    });

    const result = await scanner.scan();

    expect(result.category.id).toBe('mail-attachments');
    expect(result.items.length).toBe(2);
  });

  it('should handle missing mail directory', async () => {
    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      mailDownloads: join(testDir, 'nonexistent'),
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
    expect(result.totalSize).toBe(0);
  });

  it('should calculate total size correctly', async () => {
    const mailDir = join(testDir, 'Mail Downloads');
    await mkdir(mailDir, { recursive: true });
    const content1 = 'pdf content here';
    const content2 = 'docx content here';
    await writeFile(join(mailDir, 'attachment1.pdf'), content1);
    await writeFile(join(mailDir, 'attachment2.docx'), content2);

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      mailDownloads: mailDir,
    });

    const result = await scanner.scan();

    expect(result.totalSize).toBe(content1.length + content2.length);
  });
});

