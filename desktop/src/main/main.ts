import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  screen,
  shell,
  Tray,
  type IpcMainInvokeEvent,
} from 'electron';
import { statfs } from 'fs/promises';
import { join } from 'path';
import { ALL_SCANNERS } from '../../../src/scanners/index.js';
import { hasFullDiskAccess } from '../../../src/utils/fda.js';
import { formatSize } from '../../../src/utils/size.js';
import { IPC, type AppState, type CategoryId, type DiskInfo, type RunRecord, type SettingsPatch } from '../shared/types.js';
import { CleanerController } from './controller.js';
import { Store } from './store.js';

const WINDOW_WIDTH = 380;
const WINDOW_HEIGHT = 580;
const TICK_INTERVAL_MS = 60 * 1000;
const FDA_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';

let tray: Tray | null = null;
let win: BrowserWindow | null = null;
let controller: CleanerController;
let store: Store;
let hiddenByBlurAt = 0;

const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) {
  app.quit();
}

/** Disk and permission probes are cheap but run on every progress update, so cache them briefly. */
function cached<T>(fn: () => Promise<T>, ttlMs: number): () => Promise<T> {
  let value: { at: number; promise: Promise<T> } | null = null;
  return () => {
    if (!value || Date.now() - value.at > ttlMs) {
      value = { at: Date.now(), promise: fn() };
    }
    return value.promise;
  };
}

const getDisk = cached(async (): Promise<DiskInfo | null> => {
  try {
    const stats = await statfs('/');
    return { total: stats.blocks * stats.bsize, free: stats.bavail * stats.bsize };
  } catch {
    return null;
  }
}, 5000);

const getFullDiskAccess = cached(hasFullDiskAccess, 10000);

function assetPath(name: string): string {
  return join(__dirname, '..', 'assets', name);
}

function createTrayIcon(): Electron.NativeImage {
  const icon = nativeImage.createFromPath(assetPath('trayTemplate.png'));
  icon.setTemplateImage(true);
  return icon;
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    vibrancy: 'popover',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The app is an LSUIElement already, so skip the process type dance that would flash a Dock icon.
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  window.loadFile(join(__dirname, 'renderer', 'index.html'));

  window.on('blur', () => {
    if (window.webContents.isDevToolsOpened()) return;
    hiddenByBlurAt = Date.now();
    window.hide();
  });

  // The popover only ever shows our bundled page.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  return window;
}

function positionWindow(): void {
  if (!tray || !win) return;
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const area = display.workArea;

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - WINDOW_WIDTH / 2);
  x = Math.max(area.x + 8, Math.min(x, area.x + area.width - WINDOW_WIDTH - 8));
  const y = Math.round(trayBounds.y + trayBounds.height + 4);

  win.setPosition(x, y, false);
}

function showWindow(): void {
  if (!win) win = createWindow();
  positionWindow();
  win.show();
  win.focus();
  void controller.getState().then(broadcast);
}

function toggleWindow(): void {
  // Clicking the tray icon while the popover is open blurs it first; don't reopen it right away.
  if (Date.now() - hiddenByBlurAt < 250) return;
  if (win?.isVisible()) {
    win.hide();
  } else {
    showWindow();
  }
}

function broadcast(state: AppState): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.stateChanged, state);
  }
  updateTray(state);
}

function updateTray(state: AppState): void {
  if (!tray) return;
  const busy = state.status.phase !== 'idle';
  const last = state.history[0];

  let title = '';
  if (busy) {
    title = ' …';
  } else if (state.settings.showFreedInMenuBar && last && last.freedSpace > 0) {
    title = ` ${formatSize(last.freedSpace)}`;
  }
  tray.setTitle(title);

  const tooltip = busy
    ? 'Mac Cleaner — cleaning…'
    : last
      ? `Mac Cleaner — last run freed ${formatSize(last.freedSpace)}`
      : 'Mac Cleaner';
  tray.setToolTip(tooltip);
}

function buildContextMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'Open Mac Cleaner', click: showWindow },
    {
      label: 'Clean Now',
      enabled: !controller.isBusy,
      click: () => void controller.runQuickClean().catch(() => undefined),
    },
    { type: 'separator' },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: store.settings.launchAtLogin,
      click: (item) => void controller.updateSettings({ launchAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: 'Quit Mac Cleaner', role: 'quit' },
  ]);
}

function applyLoginItem(openAtLogin: boolean): void {
  // Registering a login item from an unpackaged dev build would point at the Electron binary.
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin });
}

function notifyRun(record: RunRecord): void {
  if (!Notification.isSupported()) return;
  if (record.mode === 'auto' && !store.settings.notifyAfterAutoClean) return;
  // Manual runs started from the popover show their result there.
  if (record.mode !== 'auto' && win?.isVisible()) return;

  const title = record.mode === 'auto' ? 'Daily clean finished' : 'Clean finished';
  const body =
    record.freedSpace > 0
      ? `Freed ${formatSize(record.freedSpace)} across ${record.cleanedItems} items.`
      : 'Your Mac was already clean. Nothing to remove.';
  const notification = new Notification({ title, body, silent: true });
  notification.on('click', showWindow);
  notification.show();
}

/** Only accept IPC from our own bundled page. */
function fromOurPage(event: IpcMainInvokeEvent): boolean {
  return event.senderFrame?.url.startsWith('file://') ?? false;
}

function handle<T>(channel: string, fn: (...args: unknown[]) => Promise<T> | T): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!fromOurPage(event)) throw new Error('Unauthorized IPC sender');
    return fn(...args);
  });
}

function registerIpc(): void {
  handle(IPC.getState, () => controller.getState());
  handle(IPC.updateSettings, (patch) => controller.updateSettings(patch as SettingsPatch));
  handle(IPC.runQuickClean, () => controller.runQuickClean());
  handle(IPC.scanDeep, (ids) => controller.scanDeep(ids as CategoryId[]));
  handle(IPC.cleanDeep, (ids) => controller.cleanDeep(ids as CategoryId[]));
  handle(IPC.clearHistory, () => controller.clearHistory());
  handle(IPC.openFullDiskAccessSettings, () => shell.openExternal(FDA_SETTINGS_URL));
  handle(IPC.revealPath, (path) => {
    if (typeof path === 'string' && path.startsWith('/')) shell.showItemInFolder(path);
  });
  handle(IPC.quit, () => app.quit());
}

function startScheduler(): void {
  const tick = () => void controller.tick().catch((error) => console.error('Auto clean failed:', error));
  setInterval(tick, TICK_INTERVAL_MS);
  powerMonitor.on('resume', tick);
  powerMonitor.on('unlock-screen', tick);
  // Give the system a moment after login before touching the disk.
  setTimeout(tick, 30 * 1000);
}

app.on('second-instance', showWindow);

// Menu bar apps keep running with no windows open.
app.on('window-all-closed', () => undefined);

app.whenReady().then(async () => {
  if (!isPrimaryInstance) return;
  app.dock?.hide();

  store = await Store.open(app.getPath('userData'));
  controller = new CleanerController({
    store,
    registry: ALL_SCANNERS,
    version: app.getVersion(),
    getDisk,
    getFullDiskAccess,
    onStateChanged: broadcast,
    onRunFinished: notifyRun,
    onSettingsChanged: (state) => applyLoginItem(state.settings.launchAtLogin),
  });

  applyLoginItem(store.settings.launchAtLogin);
  registerIpc();

  tray = new Tray(createTrayIcon());
  tray.setIgnoreDoubleClickEvents(true);
  tray.on('click', toggleWindow);
  tray.on('right-click', () => tray?.popUpContextMenu(buildContextMenu()));

  win = createWindow();
  updateTray(await controller.getState());
  startScheduler();
});
