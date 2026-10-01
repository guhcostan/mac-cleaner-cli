import { createHash } from 'crypto';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  APP_BUNDLE,
  detectArch,
  expectedSha256,
  installApp,
  pickAsset,
  type AppInstallDeps,
  type Release,
} from './app.js';

const ZIP_BYTES = Buffer.from('pretend this is a zip with Mac Cleaner.app inside');
const ZIP_SHA = createHash('sha256').update(ZIP_BYTES).digest('hex');

function release(overrides: Partial<Release> = {}): Release {
  return {
    tag_name: 'v1.4.0',
    assets: [
      { name: 'Mac-Cleaner-1.4.0-arm64.dmg', browser_download_url: 'https://github.com/x/arm64.dmg', digest: null },
      {
        name: 'Mac-Cleaner-1.4.0-arm64-mac.zip',
        browser_download_url: 'https://github.com/guhcostan/mac-cleaner-cli/releases/download/v1.4.0/Mac-Cleaner-1.4.0-arm64-mac.zip',
        digest: `sha256:${ZIP_SHA}`,
      },
      {
        name: 'Mac-Cleaner-1.4.0-x64-mac.zip',
        browser_download_url: 'https://github.com/guhcostan/mac-cleaner-cli/releases/download/v1.4.0/Mac-Cleaner-1.4.0-x64-mac.zip',
        digest: `sha256:${ZIP_SHA}`,
      },
    ],
    ...overrides,
  };
}

describe('pickAsset', () => {
  it('picks the zip for the requested architecture', () => {
    expect(pickAsset(release(), 'arm64').name).toBe('Mac-Cleaner-1.4.0-arm64-mac.zip');
    expect(pickAsset(release(), 'x64').name).toBe('Mac-Cleaner-1.4.0-x64-mac.zip');
  });

  it('fails when the architecture is missing', () => {
    const r = release({ assets: release().assets.filter((a) => !a.name.includes('x64')) });
    expect(() => pickAsset(r, 'x64')).toThrow('no Mac Cleaner app for x64');
  });

  it('refuses assets served from somewhere other than github.com', () => {
    const r = release({
      assets: [{ name: 'Mac-Cleaner-1.4.0-arm64-mac.zip', browser_download_url: 'https://evil.example/app.zip', digest: null }],
    });
    expect(() => pickAsset(r, 'arm64')).toThrow('Unexpected download URL');
  });

  it('ignores names that only look similar', () => {
    const r = release({
      assets: [{ name: 'Mac-Cleaner-../../x-arm64-mac.zip', browser_download_url: 'https://github.com/x', digest: null }],
    });
    expect(() => pickAsset(r, 'arm64')).toThrow();
  });
});

describe('expectedSha256', () => {
  it('reads the digest GitHub publishes', () => {
    expect(expectedSha256(release().assets[1])).toBe(ZIP_SHA);
  });

  it('refuses to continue without a digest', () => {
    expect(() => expectedSha256(release().assets[0])).toThrow('cannot be verified');
  });
});

describe('detectArch', () => {
  it('uses sysctl so Rosetta does not hide Apple Silicon', async () => {
    expect(await detectArch({ run: async () => '1\n' })).toBe('arm64');
    expect(await detectArch({ run: async () => '0\n' })).toBe('x64');
  });

  it('falls back to the Node architecture when sysctl fails', async () => {
    const arch = await detectArch({ run: async () => { throw new Error('no sysctl'); } });
    expect(arch).toBe(process.arch === 'arm64' ? 'arm64' : 'x64');
  });
});

describe('installApp', () => {
  let root: string;
  let installDir: string;
  let calls: string[][];
  let logs: string[];
  let running: boolean;
  let downloadBytes: Buffer;
  let apiStatus: number;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mac-cleaner-app-test-'));
    installDir = join(root, 'Applications');
    calls = [];
    logs = [];
    running = false;
    downloadBytes = ZIP_BYTES;
    apiStatus = 200;
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function deps(overrides: Partial<AppInstallDeps> = {}): AppInstallDeps {
    let tempCount = 0;
    return {
      fetch: (async (input: string | URL | Request) => {
        const url = String(input);
        if (url.startsWith('https://api.github.com/')) {
          return new Response(JSON.stringify(release()), { status: apiStatus });
        }
        return new Response(new Uint8Array(downloadBytes), { status: 200 });
      }) as typeof fetch,
      run: async (command, args) => {
        calls.push([command, ...args]);
        switch (command) {
          case '/usr/sbin/sysctl':
            return '1\n';
          case '/usr/bin/pgrep':
            if (!running) throw new Error('no process');
            return '123\n';
          case '/usr/bin/ditto':
            if (args[0] === '-x') {
              // Pretend to unzip: create the app bundle.
              await mkdir(join(args[3], APP_BUNDLE, 'Contents'), { recursive: true });
              await writeFile(join(args[3], APP_BUNDLE, 'Contents', 'Info.plist'), 'new version');
            } else {
              await cp(args[0], args[1], { recursive: true });
            }
            return '';
          default:
            return '';
        }
      },
      log: (message) => logs.push(message),
      home: root,
      systemAppsDir: join(root, 'SystemApplications'),
      makeTempDir: async () => {
        const dir = join(root, `tmp-${++tempCount}`);
        await mkdir(dir, { recursive: true });
        return dir;
      },
      ...overrides,
    };
  }

  const commands = () => calls.map((c) => c[0]);

  it('downloads, verifies, installs and opens the app', async () => {
    const result = await installApp({ dir: installDir }, deps());

    expect(result).toEqual({ version: 'v1.4.0', arch: 'arm64', appPath: join(installDir, APP_BUNDLE) });
    expect(await readFile(join(installDir, APP_BUNDLE, 'Contents', 'Info.plist'), 'utf-8')).toBe('new version');
    expect(commands()).toEqual([
      '/usr/sbin/sysctl',
      '/usr/bin/ditto',
      '/usr/bin/ditto',
      '/usr/bin/pgrep',
      '/usr/bin/xattr',
      '/usr/bin/open',
    ]);
    expect(calls.find((c) => c[0] === '/usr/bin/xattr')).toEqual([
      '/usr/bin/xattr', '-dr', 'com.apple.quarantine', join(installDir, APP_BUNDLE),
    ]);
    // The temporary download folder is cleaned up.
    expect(await stat(join(root, 'tmp-1')).catch(() => null)).toBeNull();
  });

  it('replaces an existing install and quits the running app first', async () => {
    await mkdir(join(installDir, APP_BUNDLE, 'Contents'), { recursive: true });
    await writeFile(join(installDir, APP_BUNDLE, 'Contents', 'Info.plist'), 'old version');
    await writeFile(join(installDir, APP_BUNDLE, 'Contents', 'stale-file'), 'x');
    running = true;

    await installApp({ dir: installDir, open: false }, deps());

    expect(await readFile(join(installDir, APP_BUNDLE, 'Contents', 'Info.plist'), 'utf-8')).toBe('new version');
    expect(await stat(join(installDir, APP_BUNDLE, 'Contents', 'stale-file')).catch(() => null)).toBeNull();
    expect(commands()).toContain('/usr/bin/osascript');
    expect(commands()).not.toContain('/usr/bin/open');
    expect(await stat(join(installDir, `.${APP_BUNDLE}.installing`)).catch(() => null)).toBeNull();
  });

  it('installs nothing when the checksum does not match', async () => {
    downloadBytes = Buffer.from('tampered');

    await expect(installApp({ dir: installDir }, deps())).rejects.toThrow('Checksum mismatch');

    expect(await stat(join(installDir, APP_BUNDLE)).catch(() => null)).toBeNull();
    expect(commands()).not.toContain('/usr/bin/ditto');
    expect(await stat(join(root, 'tmp-1')).catch(() => null)).toBeNull();
  });

  it('keeps the current install when copying the new one fails', async () => {
    await mkdir(join(installDir, APP_BUNDLE, 'Contents'), { recursive: true });
    await writeFile(join(installDir, APP_BUNDLE, 'Contents', 'Info.plist'), 'old version');
    const base = deps();

    await expect(
      installApp(
        { dir: installDir },
        {
          ...base,
          run: async (command, args) => {
            if (command === '/usr/bin/ditto' && args[0] !== '-x') throw new Error('disk full');
            return base.run(command, args);
          },
        }
      )
    ).rejects.toThrow('disk full');

    expect(await readFile(join(installDir, APP_BUNDLE, 'Contents', 'Info.plist'), 'utf-8')).toBe('old version');
  });

  it('fails clearly when the zip does not contain the app', async () => {
    const base = deps();
    await expect(
      installApp(
        { dir: installDir },
        {
          ...base,
          run: async (command, args) => (command === '/usr/bin/ditto' ? '' : base.run(command, args)),
        }
      )
    ).rejects.toThrow(`does not contain ${APP_BUNDLE}`);
  });

  it('sends GITHUB_TOKEN to the GitHub API only', async () => {
    const seen: Array<{ url: string; auth?: string }> = [];
    const base = deps();
    await installApp(
      { dir: installDir, open: false },
      {
        ...base,
        githubToken: 'secret-token',
        fetch: (async (input: string | URL | Request, init?: RequestInit) => {
          const headers = (init?.headers ?? {}) as Record<string, string>;
          seen.push({ url: String(input), auth: headers.Authorization });
          return base.fetch(input, init);
        }) as typeof fetch,
      }
    );
    expect(seen[0]).toEqual({ url: expect.stringContaining('api.github.com'), auth: 'Bearer secret-token' });
    expect(seen[1].auth).toBeUndefined();
  });

  it('reports GitHub API errors', async () => {
    apiStatus = 403;
    await expect(installApp({ dir: installDir }, deps())).rejects.toThrow('HTTP 403');
  });

  it('rejects an unexpected API payload', async () => {
    const base = deps();
    await expect(
      installApp(
        { dir: installDir },
        { ...base, fetch: (async () => new Response('{"message":"nope"}')) as typeof fetch }
      )
    ).rejects.toThrow('Unexpected response');
  });

  it('reports a failed download', async () => {
    const base = deps();
    await expect(
      installApp(
        { dir: installDir },
        {
          ...base,
          fetch: (async (input: string | URL | Request) =>
            String(input).startsWith('https://api.github.com/')
              ? new Response(JSON.stringify(release()))
              : new Response('gone', { status: 404 })) as typeof fetch,
        }
      )
    ).rejects.toThrow('Download failed (HTTP 404)');
  });

  it('installs into the system Applications folder when it is writable', async () => {
    await mkdir(join(root, 'SystemApplications'));
    const result = await installApp({ open: false }, deps());
    expect(result.appPath).toBe(join(root, 'SystemApplications', APP_BUNDLE));
  });

  it('falls back to ~/Applications when the system folder is not writable', async () => {
    // SystemApplications does not exist here, like a standard account that can't write to /Applications.
    const result = await installApp({ open: false }, deps());
    expect(result.appPath).toBe(join(root, 'Applications', APP_BUNDLE));
  });
});
