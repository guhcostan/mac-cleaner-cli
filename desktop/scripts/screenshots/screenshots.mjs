// Renders the README screenshots of the desktop app from the real renderer, with sample data.
//
//   bun run build                 # builds dist/renderer
//   bun run screenshots           # writes ../assets/screenshots/*.png
//
// Needs Playwright with Chromium (`npx playwright install chromium`), or set CHROMIUM_PATH.
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', '..', 'assets', 'screenshots');
const stage = pathToFileURL(join(here, 'stage.html')).href;

const { chromium } = await import('playwright').catch(() => {
  console.error('Playwright is required: bun add -d playwright && npx playwright install chromium');
  process.exit(1);
});

const NOW = new Date('2026-10-02T10:24:00');
const GB = 1024 ** 3;
const MB = 1024 ** 2;
const at = (daysAgo, hour, minute = 0) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

const categories = [
  ['temp-files', 'Temporary Files', 'safe', 'Temporary files in /tmp and /var/folders'],
  ['trash', 'Trash', 'safe', 'Files in the Trash bin'],
  ['browser-cache', 'Browser Cache', 'safe', 'Cache from Chrome, Safari, Firefox, and Arc'],
  ['system-cache', 'User Cache Files', 'moderate', 'Application caches stored in ~/Library/Caches'],
  ['system-logs', 'System Log Files', 'moderate', 'System and application logs'],
  ['dev-cache', 'Development Cache', 'moderate', 'npm, yarn, pip, Xcode DerivedData, CocoaPods cache'],
  ['homebrew', 'Homebrew Cache', 'moderate', 'Homebrew download cache and old versions'],
  ['docker', 'Docker', 'moderate', 'Unused Docker images, containers, and build cache'],
  ['node-modules', 'Node Modules', 'moderate', 'Orphaned node_modules in old projects'],
  ['launch-agents', 'Orphaned Launch Agents', 'moderate', 'Launch agents pointing to non-existent applications'],
  ['downloads', 'Old Downloads', 'risky', 'Downloads older than 30 days'],
  ['ios-backups', 'iOS Backups', 'risky', 'iPhone and iPad backup files'],
  ['large-files', 'Large Files', 'risky', 'Files larger than 500MB for review'],
  ['duplicates', 'Duplicate Files', 'risky', 'Files with identical content'],
].map(([id, name, safetyLevel, description]) => ({ id, name, group: 'System Junk', description, safetyLevel }));

const run = (id, mode, finishedAt, parts) => ({
  id,
  mode,
  startedAt: finishedAt,
  finishedAt,
  freedSpace: parts.reduce((s, p) => s + p[2], 0),
  cleanedItems: parts.reduce((s, p) => s + p[3], 0),
  errors: [],
  categories: parts.map(([cid, name, freedSpace, cleanedItems]) => ({ id: cid, name, freedSpace, cleanedItems, errors: [] })),
});

const history = [
  run('r1', 'auto', at(0, 10, 0), [
    ['browser-cache', 'Browser Cache', 1.9 * GB, 4],
    ['temp-files', 'Temporary Files', 912 * MB, 318],
    ['system-logs', 'System Log Files', 344 * MB, 57],
  ]),
  run('r2', 'deep', at(1, 18, 42), [
    ['dev-cache', 'Development Cache', 12.4 * GB, 9],
    ['system-cache', 'User Cache Files', 6.1 * GB, 241],
  ]),
  run('r3', 'auto', at(1, 10, 0), [
    ['browser-cache', 'Browser Cache', 1.4 * GB, 4],
    ['temp-files', 'Temporary Files', 655 * MB, 204],
  ]),
  run('r4', 'quick', at(2, 15, 12), [
    ['temp-files', 'Temporary Files', 1.1 * GB, 166],
  ]),
  run('r5', 'auto', at(3, 10, 0), [
    ['browser-cache', 'Browser Cache', 2.2 * GB, 4],
    ['system-logs', 'System Log Files', 512 * MB, 61],
  ]),
];

const tomorrow = new Date(NOW);
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(10, 0, 0, 0);

const state = {
  version: '1.4.0',
  settings: {
    autoClean: {
      enabled: true,
      hour: 10,
      minute: 0,
      categories: ['temp-files', 'browser-cache', 'system-logs'],
      tempFilesMinAgeHours: 24,
    },
    notifyAfterAutoClean: true,
    launchAtLogin: true,
    showFreedInMenuBar: false,
  },
  history,
  totalFreed: 41.7 * GB,
  nextAutoRunAt: tomorrow.toISOString(),
  status: { phase: 'idle' },
  disk: { total: 494.38 * GB, free: 87.3 * GB },
  fullDiskAccess: true,
  categories,
};

const preview = {
  scannedAt: NOW.toISOString(),
  totalSize: 0,
  categories: [
    { id: 'dev-cache', name: 'Development Cache', safetyLevel: 'moderate', safetyNote: 'Projects will need to rebuild/reinstall dependencies', totalSize: 12.4 * GB, itemCount: 9,
      topItems: [
        { name: 'Xcode DerivedData', path: '~/Library/Developer/Xcode/DerivedData', size: 7.9 * GB },
        { name: 'npm cache', path: '~/.npm/_cacache', size: 2.6 * GB },
        { name: 'Gradle caches', path: '~/.gradle/caches', size: 1.3 * GB },
      ] },
    { id: 'system-cache', name: 'User Cache Files', safetyLevel: 'moderate', totalSize: 6.1 * GB, itemCount: 241, topItems: [] },
    { id: 'docker', name: 'Docker', safetyLevel: 'moderate', totalSize: 4.2 * GB, itemCount: 3, topItems: [] },
    { id: 'node-modules', name: 'Node Modules', safetyLevel: 'moderate', totalSize: 3.8 * GB, itemCount: 14, topItems: [] },
    { id: 'trash', name: 'Trash', safetyLevel: 'safe', totalSize: 2.3 * GB, itemCount: 87, topItems: [] },
    { id: 'downloads', name: 'Old Downloads', safetyLevel: 'risky', safetyNote: 'May contain important files you forgot about', totalSize: 5.2 * GB, itemCount: 23, topItems: [] },
  ],
};
preview.totalSize = preview.categories.reduce((s, c) => s + c.totalSize, 0);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
await mkdir(outDir, { recursive: true });

async function shoot(file, { scheme, views, captions = false, width = 1200, height = 720, prepare }) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    locale: 'en-US',
    timezoneId: 'UTC',
    bypassCSP: true,
  });
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(({ state, preview }) => {
    window.cleaner = {
      getState: async () => state,
      updateSettings: async () => state,
      runQuickClean: async () => null,
      scanDeep: async () => preview,
      cleanDeep: async () => null,
      clearHistory: async () => state,
      openFullDiskAccessSettings: async () => {},
      revealPath: async () => {},
      quit: async () => {},
      onStateChanged: () => () => {},
    };
  }, { state, preview });

  const query = `views=${views.join(',')}${captions ? '&captions=1' : ''}`;
  await page.goto(`${stage}?${query}`);
  for (const view of views) {
    const frame = page.frame({ name: view });
    await frame.waitForSelector('.card');
    if (view !== 'home') await frame.click(`[data-view=${view}]`);
    await prepare?.[view]?.(frame);
  }
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(outDir, file) });
  await page.close();
  console.log('wrote', file);
}

const prepare = {
  deep: async (frame) => {
    await frame.click('.btn.primary'); // Scan
    await frame.waitForSelector('text=Found');
    await frame.click('.list-item .grow'); // expand Development Cache
    await frame.click('.btn.danger'); // ask for confirmation
    // The confirmation sits below the list: scroll it into view like a user would.
    await frame.evaluate(() => { const view = document.getElementById('view'); view.scrollTop = view.scrollHeight; });
  },
  history: async (frame) => {
    await frame.click('.list .list-item'); // expand today's run
  },
};

for (const scheme of ['light', 'dark']) {
  await shoot(`app-${scheme}.png`, { scheme, views: ['home'], width: 760, height: 640 });
  await shoot(`app-tour-${scheme}.png`, {
    scheme,
    views: ['deep', 'history', 'settings'],
    captions: true,
    width: 1340,
    height: 740,
    prepare,
  });
}

await browser.close();
