import chalk from 'chalk';
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { createWriteStream } from 'fs';
import { access, mkdir, mkdtemp, rename, rm, stat } from 'fs/promises';
import { constants } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as WebReadableStream } from 'stream/web';

/**
 * Installs or updates the Mac Cleaner menu bar app from the latest GitHub release.
 *
 * The app is not signed with an Apple Developer ID, so a .dmg downloaded with a
 * browser is flagged by Gatekeeper. Browsers mark downloads with the
 * com.apple.quarantine attribute; Node's fetch does not, so an app installed
 * from here opens without the "Apple could not verify…" prompt. The download is
 * still checked against the SHA-256 digest GitHub publishes for the asset.
 */

const REPO = 'guhcostan/mac-cleaner-cli';
const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const APP_BUNDLE = 'Mac Cleaner.app';
const APP_PROCESS = 'Mac Cleaner';
const BUNDLE_ID = 'io.github.guhcostan.maccleaner';

export type AppArch = 'arm64' | 'x64';

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  digest?: string | null;
}

export interface Release {
  tag_name: string;
  assets: ReleaseAsset[];
}

export interface AppInstallDeps {
  fetch: typeof fetch;
  /** Runs a binary with arguments; rejects on a non-zero exit. */
  run: (command: string, args: string[]) => Promise<string>;
  log: (message: string) => void;
  home: string;
  githubToken?: string;
  /** Where apps go system-wide; falls back to ~/Applications when it isn't writable. */
  systemAppsDir: string;
  makeTempDir: () => Promise<string>;
}

export interface AppInstallOptions {
  /** Open the app once installed (default true). */
  open?: boolean;
  /** Install into this folder instead of /Applications. */
  dir?: string;
}

export interface AppInstallResult {
  version: string;
  arch: AppArch;
  appPath: string;
}

function defaultRun(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 120_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} ${args.join(' ')} failed: ${stderr?.toString().trim() || error.message}`));
      } else {
        resolve(stdout.toString());
      }
    });
  });
}

export const defaultDeps: AppInstallDeps = {
  fetch: (...args) => fetch(...args),
  run: defaultRun,
  log: (message) => console.log(message),
  home: homedir(),
  githubToken: process.env.MAC_CLEANER_GITHUB_TOKEN || undefined,
  systemAppsDir: '/Applications',
  makeTempDir: () => mkdtemp(join(tmpdir(), 'mac-cleaner-app-')),
};

/** Apple Silicon is detected through sysctl so a Node running under Rosetta still gets the arm64 app. */
export async function detectArch(deps: Pick<AppInstallDeps, 'run'>): Promise<AppArch> {
  try {
    const value = await deps.run('/usr/sbin/sysctl', ['-in', 'hw.optional.arm64']);
    return value.trim() === '1' ? 'arm64' : 'x64';
  } catch {
    return process.arch === 'arm64' ? 'arm64' : 'x64';
  }
}

/** The zip of the app for this architecture, e.g. `Mac-Cleaner-1.4.0-arm64-mac.zip`. */
export function pickAsset(release: Release, arch: AppArch): ReleaseAsset {
  const pattern = new RegExp(`^Mac-Cleaner-[0-9][0-9A-Za-z.+-]*-${arch}-mac\\.zip$`);
  const asset = release.assets.find((a) => pattern.test(a.name));
  if (!asset) {
    throw new Error(`Release ${release.tag_name} has no Mac Cleaner app for ${arch}.`);
  }
  if (!asset.browser_download_url.startsWith('https://github.com/')) {
    throw new Error(`Unexpected download URL for ${asset.name}.`);
  }
  return asset;
}

/** The expected SHA-256 (hex) of an asset, from the digest GitHub publishes for it. */
export function expectedSha256(asset: ReleaseAsset): string {
  const match = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest ?? '');
  if (!match) {
    throw new Error(`GitHub did not publish a SHA-256 digest for ${asset.name}, so the download cannot be verified.`);
  }
  return match[1].toLowerCase();
}

async function fetchLatestRelease(deps: AppInstallDeps): Promise<Release> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'mac-cleaner-cli' };
  // Optional: avoids the unauthenticated API rate limit (60 requests/hour per IP), e.g. in CI.
  if (deps.githubToken) headers.Authorization = `Bearer ${deps.githubToken}`;
  const response = await deps.fetch(RELEASE_API, { headers });
  if (!response.ok) {
    throw new Error(`Could not read the latest release from GitHub (HTTP ${response.status}).`);
  }
  const release = (await response.json()) as Release;
  if (typeof release?.tag_name !== 'string' || !Array.isArray(release.assets)) {
    throw new Error('Unexpected response from the GitHub releases API.');
  }
  return release;
}

/** Streams the asset to disk while hashing it; returns the SHA-256 hex digest. */
async function download(url: string, destination: string, deps: AppInstallDeps): Promise<string> {
  const response = await deps.fetch(url, { headers: { 'User-Agent': 'mac-cleaner-cli' } });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (HTTP ${response.status}).`);
  }

  const hash = createHash('sha256');
  const hashing = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body as WebReadableStream), hashing, createWriteStream(destination));
  return hash.digest('hex');
}

async function isWritableDir(path: string): Promise<boolean> {
  try {
    await access(path, constants.W_OK);
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function chooseInstallDir(options: AppInstallOptions, deps: AppInstallDeps): Promise<string> {
  if (options.dir) {
    await mkdir(options.dir, { recursive: true });
    return options.dir;
  }
  if (await isWritableDir(deps.systemAppsDir)) {
    return deps.systemAppsDir;
  }
  // Standard accounts can't write to /Applications; ~/Applications works the same for a single user.
  const userApps = join(deps.home, 'Applications');
  await mkdir(userApps, { recursive: true });
  return userApps;
}

/** Quits a running copy so its bundle can be replaced. */
async function quitRunningApp(deps: AppInstallDeps): Promise<void> {
  try {
    await deps.run('/usr/bin/pgrep', ['-x', APP_PROCESS]);
  } catch {
    return; // not running
  }
  deps.log(chalk.dim('Quitting the running Mac Cleaner…'));
  try {
    await deps.run('/usr/bin/osascript', ['-e', `tell application id "${BUNDLE_ID}" to quit`]);
  } catch {
    // Already gone or not scriptable; replacing the bundle still works.
  }
}

export async function installApp(
  options: AppInstallOptions = {},
  deps: AppInstallDeps = defaultDeps
): Promise<AppInstallResult> {
  const release = await fetchLatestRelease(deps);
  const arch = await detectArch(deps);
  const asset = pickAsset(release, arch);
  const expected = expectedSha256(asset);

  const workDir = await deps.makeTempDir();
  try {
    deps.log(`Downloading Mac Cleaner ${release.tag_name} (${arch === 'arm64' ? 'Apple Silicon' : 'Intel'})…`);
    const zipPath = join(workDir, asset.name);
    const actual = await download(asset.browser_download_url, zipPath, deps);
    if (actual !== expected) {
      throw new Error(`Checksum mismatch for ${asset.name}: expected ${expected}, got ${actual}. Nothing was installed.`);
    }

    // ditto keeps the bundle's symlinks, permissions and code signature intact.
    const extractDir = join(workDir, 'extracted');
    await deps.run('/usr/bin/ditto', ['-x', '-k', zipPath, extractDir]);
    const extractedApp = join(extractDir, APP_BUNDLE);
    if (!(await stat(extractedApp).catch(() => null))?.isDirectory()) {
      throw new Error(`${asset.name} does not contain ${APP_BUNDLE}.`);
    }

    const installDir = await chooseInstallDir(options, deps);
    const appPath = join(installDir, APP_BUNDLE);

    // Copy next to the destination first, so a failed copy never leaves the user without an app,
    // then swap it in with a rename on the same volume.
    const stagedApp = join(installDir, `.${APP_BUNDLE}.installing`);
    await rm(stagedApp, { recursive: true, force: true });
    await deps.run('/usr/bin/ditto', [extractedApp, stagedApp]);

    await quitRunningApp(deps);
    await rm(appPath, { recursive: true, force: true });
    await rename(stagedApp, appPath);
    // Nothing should carry the attribute after a fetch download; clear it anyway so the
    // app never shows the Gatekeeper prompt.
    await deps.run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', appPath]).catch(() => undefined);

    deps.log(chalk.green(`✓ Mac Cleaner ${release.tag_name} installed in ${installDir}`));

    if (options.open !== false) {
      await deps.run('/usr/bin/open', [appPath]);
      deps.log(chalk.dim('It lives in the menu bar (top right). Grant it Full Disk Access when it asks.'));
    }

    return { version: release.tag_name, arch, appPath };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function appInstallCommand(options: AppInstallOptions): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error('The Mac Cleaner app only runs on macOS.');
  }
  await installApp(options);
}
