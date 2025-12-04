import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { LanguageFilesScanner } from './language-files.js';
import * as paths from '../utils/paths.js';

describe('LanguageFilesScanner', () => {
  let testDir: string;
  let scanner: LanguageFilesScanner;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'clean-my-mac-lang-test-'));
    scanner = new LanguageFilesScanner();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('language-files');
    expect(scanner.category.name).toBe('Language Files');
    expect(scanner.category.group).toBe('System Junk');
    expect(scanner.category.safetyLevel).toBe('risky');
  });

  it('should scan application language files', async () => {
    const appsDir = join(testDir, 'Applications');
    const appResources = join(appsDir, 'TestApp.app', 'Contents', 'Resources');
    
    await mkdir(join(appResources, 'en.lproj'), { recursive: true });
    await mkdir(join(appResources, 'fr.lproj'), { recursive: true });
    await mkdir(join(appResources, 'de.lproj'), { recursive: true });
    
    await writeFile(join(appResources, 'en.lproj', 'Localizable.strings'), 'english');
    await writeFile(join(appResources, 'fr.lproj', 'Localizable.strings'), 'french');
    await writeFile(join(appResources, 'de.lproj', 'Localizable.strings'), 'german');

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      applications: appsDir,
    });

    const result = await scanner.scan();

    expect(result.items.length).toBe(2);
    expect(result.items.some(i => i.name.includes('fr.lproj'))).toBe(true);
    expect(result.items.some(i => i.name.includes('de.lproj'))).toBe(true);
  });

  it('should keep English and Portuguese localizations', async () => {
    const appsDir = join(testDir, 'Applications');
    const appResources = join(appsDir, 'TestApp.app', 'Contents', 'Resources');
    
    await mkdir(join(appResources, 'en.lproj'), { recursive: true });
    await mkdir(join(appResources, 'en_US.lproj'), { recursive: true });
    await mkdir(join(appResources, 'pt.lproj'), { recursive: true });
    await mkdir(join(appResources, 'pt_BR.lproj'), { recursive: true });
    await mkdir(join(appResources, 'Base.lproj'), { recursive: true });
    
    await writeFile(join(appResources, 'en.lproj', 'Localizable.strings'), 'en');
    await writeFile(join(appResources, 'en_US.lproj', 'Localizable.strings'), 'en_US');
    await writeFile(join(appResources, 'pt.lproj', 'Localizable.strings'), 'pt');
    await writeFile(join(appResources, 'pt_BR.lproj', 'Localizable.strings'), 'pt_BR');
    await writeFile(join(appResources, 'Base.lproj', 'Localizable.strings'), 'base');

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      applications: appsDir,
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
  });

  it('should handle missing applications directory', async () => {
    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      applications: join(testDir, 'nonexistent'),
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
    expect(result.totalSize).toBe(0);
  });

  it('should skip non-app directories', async () => {
    const appsDir = join(testDir, 'Applications');
    await mkdir(join(appsDir, 'SomeFolder'), { recursive: true });

    vi.spyOn(paths, 'PATHS', 'get').mockReturnValue({
      ...paths.PATHS,
      applications: appsDir,
    });

    const result = await scanner.scan();

    expect(result.items).toHaveLength(0);
  });
});

