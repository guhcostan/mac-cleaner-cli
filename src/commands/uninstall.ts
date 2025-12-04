import chalk from 'chalk';
import confirm from '@inquirer/confirm';
import checkbox from '@inquirer/checkbox';
import { readdir, stat, rm } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';
import { exists, getSize, formatSize, createCleanProgress } from '../utils/index.js';

interface AppInfo {
  name: string;
  path: string;
  size: number;
  relatedPaths: string[];
  totalSize: number;
}

interface UninstallCommandOptions {
  yes?: boolean;
  dryRun?: boolean;
  noProgress?: boolean;
}

const APPLICATIONS_DIR = '/Applications';
const USER_APPLICATIONS_DIR = join(homedir(), 'Applications');

const RELATED_PATHS_TEMPLATES = [
  join(homedir(), 'Library', 'Application Support', '{APP_NAME}'),
  join(homedir(), 'Library', 'Preferences', '{BUNDLE_ID}.plist'),
  join(homedir(), 'Library', 'Preferences', '{APP_NAME}.plist'),
  join(homedir(), 'Library', 'Caches', '{APP_NAME}'),
  join(homedir(), 'Library', 'Caches', '{BUNDLE_ID}'),
  join(homedir(), 'Library', 'Logs', '{APP_NAME}'),
  join(homedir(), 'Library', 'Saved Application State', '{BUNDLE_ID}.savedState'),
  join(homedir(), 'Library', 'WebKit', '{APP_NAME}'),
  join(homedir(), 'Library', 'HTTPStorages', '{BUNDLE_ID}'),
  join(homedir(), 'Library', 'Containers', '{BUNDLE_ID}'),
  join(homedir(), 'Library', 'Group Containers', '*.{APP_NAME}'),
];

export async function uninstallCommand(options: UninstallCommandOptions): Promise<void> {
  console.log(chalk.cyan('\nScanning installed applications...\n'));

  const apps = await getInstalledApps();

  if (apps.length === 0) {
    console.log(chalk.yellow('No applications found.\n'));
    return;
  }

  const choices = apps.map((app) => ({
    name: `${app.name.padEnd(35)} ${chalk.yellow(formatSize(app.totalSize).padStart(10))} ${chalk.dim(`(+${app.relatedPaths.length} related)`)}`,
    value: app.name,
    checked: false,
  }));

  const selectedApps = await checkbox<string>({
    message: 'Select applications to uninstall:',
    choices,
    pageSize: 15,
  });

  if (selectedApps.length === 0) {
    console.log(chalk.yellow('\nNo applications selected.\n'));
    return;
  }

  const appsToRemove = apps.filter((a) => selectedApps.includes(a.name));
  const totalSize = appsToRemove.reduce((sum, a) => sum + a.totalSize, 0);
  const totalPaths = appsToRemove.reduce((sum, a) => sum + 1 + a.relatedPaths.length, 0);

  console.log();
  console.log(chalk.bold('Applications to uninstall:'));
  for (const app of appsToRemove) {
    console.log(`  ${chalk.red('✗')} ${app.name} (${formatSize(app.totalSize)})`);
    for (const related of app.relatedPaths) {
      console.log(chalk.dim(`      └─ ${related.replace(homedir(), '~')}`));
    }
  }
  console.log();
  console.log(chalk.bold(`Total: ${formatSize(totalSize)} will be freed (${totalPaths} items)`));
  console.log();

  if (options.dryRun) {
    console.log(chalk.cyan('[DRY RUN] Would uninstall the above applications.\n'));
    return;
  }

  if (!options.yes) {
    const proceed = await confirm({
      message: 'Proceed with uninstallation?',
      default: false,
    });

    if (!proceed) {
      console.log(chalk.yellow('\nUninstallation cancelled.\n'));
      return;
    }
  }

  const showProgress = !options.noProgress && process.stdout.isTTY;
  const progress = showProgress ? createCleanProgress(appsToRemove.length) : null;

  let uninstalledCount = 0;
  let freedSpace = 0;
  const errors: string[] = [];

  for (let i = 0; i < appsToRemove.length; i++) {
    const app = appsToRemove[i];
    progress?.update(i, `Uninstalling ${app.name}...`);

    try {
      await rm(app.path, { recursive: true, force: true });
      freedSpace += app.size;

      for (const relatedPath of app.relatedPaths) {
        try {
          await rm(relatedPath, { recursive: true, force: true });
          const size = await getSize(relatedPath).catch(() => 0);
          freedSpace += size;
        } catch {
          // Ignore errors for related paths
        }
      }

      uninstalledCount++;
    } catch (error) {
      errors.push(`${app.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  progress?.finish();

  console.log();
  console.log(chalk.bold.green('✓ Uninstallation Complete'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log(`  Apps uninstalled: ${uninstalledCount}`);
  console.log(`  Space freed: ${chalk.green(formatSize(freedSpace))}`);

  if (errors.length > 0) {
    console.log();
    console.log(chalk.red('Errors:'));
    for (const error of errors) {
      console.log(chalk.red(`  ✗ ${error}`));
    }
  }

  console.log();
}

async function getInstalledApps(): Promise<AppInfo[]> {
  const apps: AppInfo[] = [];

  for (const appDir of [APPLICATIONS_DIR, USER_APPLICATIONS_DIR]) {
    if (!(await exists(appDir))) continue;

    try {
      const entries = await readdir(appDir);

      for (const entry of entries) {
        if (!entry.endsWith('.app')) continue;

        const appPath = join(appDir, entry);
        const appName = basename(entry, '.app');

        try {
          const stats = await stat(appPath);
          if (!stats.isDirectory()) continue;

          const appSize = await getSize(appPath);
          const relatedPaths = await findRelatedPaths(appName);

          let totalRelatedSize = 0;
          for (const path of relatedPaths) {
            totalRelatedSize += await getSize(path).catch(() => 0);
          }

          apps.push({
            name: appName,
            path: appPath,
            size: appSize,
            relatedPaths,
            totalSize: appSize + totalRelatedSize,
          });
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  return apps.sort((a, b) => b.totalSize - a.totalSize);
}

async function findRelatedPaths(appName: string): Promise<string[]> {
  const paths: string[] = [];
  const bundleId = appName.toLowerCase().replace(/\s+/g, '.');

  for (const template of RELATED_PATHS_TEMPLATES) {
    const variations = [
      template.replace('{APP_NAME}', appName).replace('{BUNDLE_ID}', bundleId),
      template.replace('{APP_NAME}', appName.toLowerCase()).replace('{BUNDLE_ID}', bundleId),
      template.replace('{APP_NAME}', appName.replace(/\s+/g, '')).replace('{BUNDLE_ID}', bundleId),
    ];

    for (const path of variations) {
      if (path.includes('*')) {
        const dir = path.substring(0, path.lastIndexOf('/'));
        const pattern = path.substring(path.lastIndexOf('/') + 1);

        if (await exists(dir)) {
          try {
            const entries = await readdir(dir);
            for (const entry of entries) {
              if (matchPattern(entry, pattern)) {
                const fullPath = join(dir, entry);
                if (!paths.includes(fullPath)) {
                  paths.push(fullPath);
                }
              }
            }
          } catch {
            continue;
          }
        }
      } else if (await exists(path)) {
        if (!paths.includes(path)) {
          paths.push(path);
        }
      }
    }
  }

  return paths;
}

function matchPattern(str: string, pattern: string): boolean {
  const regexPattern = pattern.replace(/\*/g, '.*').replace(/\./g, '\\.');
  return new RegExp(`^${regexPattern}$`, 'i').test(str);
}


