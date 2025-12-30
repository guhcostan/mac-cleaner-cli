import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Create a test home directory reference that can be updated
let testHome = '/tmp/test-home';

// Mock os.homedir BEFORE any imports that use it
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: vi.fn(() => testHome),
  };
});

// Now import the scanner after the mock is set up
const { LaunchAgentsScanner } = await import('./launch-agents.js');

describe('LaunchAgentsScanner', () => {
  let testDir: string;
  let scanner: LaunchAgentsScanner;
  let mockHome: string;
  let mockLaunchAgentsDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'launch-agents-test-'));
    mockHome = join(testDir, 'home');
    mockLaunchAgentsDir = join(mockHome, 'Library', 'LaunchAgents');

    await mkdir(mockHome, { recursive: true });
    await mkdir(mockLaunchAgentsDir, { recursive: true });

    // Update the test home directory
    testHome = mockHome;

    // Import os and update the mock
    const os = await import('os');
    vi.mocked(os.homedir).mockReturnValue(mockHome);

    scanner = new LaunchAgentsScanner();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('should have correct category', () => {
    expect(scanner.category.id).toBe('launch-agents');
    expect(scanner.category.name).toBe('Orphaned Launch Agents');
    expect(scanner.category.group).toBe('System Junk');
    expect(scanner.category.safetyLevel).toBe('moderate');
  });

  it('should detect orphaned launch agents', async () => {
    // Create a plist pointing to a non-existent app
    const orphanedPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.deleted.app</string>
  <key>Program</key>
  <string>/Applications/DeletedApp.app/Contents/MacOS/DeletedApp</string>
</dict>
</plist>`;

    await writeFile(join(mockLaunchAgentsDir, 'com.deleted.app.plist'), orphanedPlist);

    const result = await scanner.scan();

    expect(result.items.length).toBe(1);
    expect(result.items[0].name).toContain('com.deleted.app.plist');
    expect(result.items[0].name).toContain('DeletedApp');
    expect(result.items[0].name).toContain('missing');
    expect(result.items[0].path).toBe(join(mockLaunchAgentsDir, 'com.deleted.app.plist'));
  });

  it('should not detect valid launch agents (app exists)', async () => {
    // Create an actual app directory
    const mockAppPath = join(testDir, 'Applications', 'ValidApp.app');
    await mkdir(mockAppPath, { recursive: true });

    // Create a plist pointing to the existing app
    const validPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.valid.app</string>
  <key>Program</key>
  <string>${mockAppPath}</string>
</dict>
</plist>`;

    await writeFile(join(mockLaunchAgentsDir, 'com.valid.app.plist'), validPlist);

    const result = await scanner.scan();

    expect(result.items.length).toBe(0);
  });

  it('should skip system binaries', async () => {
    // Create plists pointing to system binaries
    const systemBinaryPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.system.task</string>
  <key>Program</key>
  <string>/usr/bin/python3</string>
</dict>
</plist>`;

    await writeFile(join(mockLaunchAgentsDir, 'com.system.task.plist'), systemBinaryPlist);

    const result = await scanner.scan();

    expect(result.items.length).toBe(0);
  });

  it('should handle malformed plists gracefully', async () => {
    // Create a malformed plist
    const malformedPlist = `<?xml version="1.0"?>
<plist><dict>
  <key>Label</key><string>com.malformed</string>
  <!-- Missing Program and ProgramArguments -->
</dict></plist>`;

    await writeFile(join(mockLaunchAgentsDir, 'com.malformed.plist'), malformedPlist);

    const result = await scanner.scan();

    // Should not throw error, just skip malformed plist
    expect(result.items.length).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it('should handle empty LaunchAgents directory', async () => {
    const result = await scanner.scan();

    expect(result.items.length).toBe(0);
    expect(result.totalSize).toBe(0);
  });

  it('should handle non-existent LaunchAgents directory', async () => {
    // Remove the LaunchAgents directory
    await rm(mockLaunchAgentsDir, { recursive: true, force: true });

    const result = await scanner.scan();

    expect(result.items.length).toBe(0);
    expect(result.totalSize).toBe(0);
  });

  it('should skip plists without Program or ProgramArguments', async () => {
    const noProgramPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.no.program</string>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>`;

    await writeFile(join(mockLaunchAgentsDir, 'com.no.program.plist'), noProgramPlist);

    const result = await scanner.scan();

    expect(result.items.length).toBe(0);
  });

  it('should handle relative paths gracefully', async () => {
    const relativePlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.relative.path</string>
  <key>Program</key>
  <string>./relative/path/app</string>
</dict>
</plist>`;

    await writeFile(join(mockLaunchAgentsDir, 'com.relative.path.plist'), relativePlist);

    const result = await scanner.scan();

    // Should skip relative paths
    expect(result.items.length).toBe(0);
  });

  it('should handle plists with ProgramArguments array', async () => {
    // Create plist with ProgramArguments instead of Program
    const programArgsPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.with.args</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Applications/NonExistentApp.app/Contents/MacOS/NonExistentApp</string>
    <string>--flag</string>
  </array>
</dict>
</plist>`;

    await writeFile(join(mockLaunchAgentsDir, 'com.with.args.plist'), programArgsPlist);

    const result = await scanner.scan();

    expect(result.items.length).toBe(1);
    expect(result.items[0].name).toContain('com.with.args.plist');
    expect(result.items[0].name).toContain('NonExistentApp');
  });

  it('should skip Homebrew binaries', async () => {
    const homebrewPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>homebrew.mxcl.service</string>
  <key>Program</key>
  <string>/opt/homebrew/bin/service</string>
</dict>
</plist>`;

    await writeFile(join(mockLaunchAgentsDir, 'homebrew.mxcl.service.plist'), homebrewPlist);

    const result = await scanner.scan();

    // Should skip Homebrew binaries (system binary prefix)
    expect(result.items.length).toBe(0);
  });

  it('should calculate total size correctly', async () => {
    const orphanedPlist1 = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.deleted.app1</string>
  <key>Program</key>
  <string>/Applications/DeletedApp1.app/Contents/MacOS/DeletedApp1</string>
</dict>
</plist>`;

    const orphanedPlist2 = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.deleted.app2</string>
  <key>Program</key>
  <string>/Applications/DeletedApp2.app/Contents/MacOS/DeletedApp2</string>
</dict>
</plist>`;

    await writeFile(join(mockLaunchAgentsDir, 'com.deleted.app1.plist'), orphanedPlist1);
    await writeFile(join(mockLaunchAgentsDir, 'com.deleted.app2.plist'), orphanedPlist2);

    const result = await scanner.scan();

    expect(result.items.length).toBe(2);
    expect(result.totalSize).toBe(orphanedPlist1.length + orphanedPlist2.length);
  });

  it('should only include .plist files', async () => {
    // Create a plist and a non-plist file
    const orphanedPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.deleted.app</string>
  <key>Program</key>
  <string>/Applications/DeletedApp.app/Contents/MacOS/DeletedApp</string>
</dict>
</plist>`;

    await writeFile(join(mockLaunchAgentsDir, 'com.deleted.app.plist'), orphanedPlist);
    await writeFile(join(mockLaunchAgentsDir, 'README.txt'), 'Not a plist file');

    const result = await scanner.scan();

    // Should only find the plist file
    expect(result.items.length).toBe(1);
    expect(result.items[0].name).toContain('.plist');
  });

  it('should handle mix of orphaned and valid plists', async () => {
    // Create a valid app
    const validAppPath = join(testDir, 'Applications', 'ValidApp.app');
    await mkdir(validAppPath, { recursive: true });

    const validPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.valid.app</string>
  <key>Program</key>
  <string>${validAppPath}</string>
</dict>
</plist>`;

    const orphanedPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.deleted.app</string>
  <key>Program</key>
  <string>/Applications/DeletedApp.app/Contents/MacOS/DeletedApp</string>
</dict>
</plist>`;

    await writeFile(join(mockLaunchAgentsDir, 'com.valid.app.plist'), validPlist);
    await writeFile(join(mockLaunchAgentsDir, 'com.deleted.app.plist'), orphanedPlist);

    const result = await scanner.scan();

    // Should only detect the orphaned plist
    expect(result.items.length).toBe(1);
    expect(result.items[0].name).toContain('com.deleted.app.plist');
  });
});
