import { formatSize } from '../../../src/utils/size.js';
import type {
  AppState,
  CategoryId,
  CategoryInfo,
  CleanerApi,
  DeepScanPreview,
  RunMode,
  RunRecord,
  SettingsPatch,
} from '../shared/types.js';

declare global {
  interface Window {
    cleaner: CleanerApi;
  }
}

type View = 'home' | 'deep' | 'history' | 'settings';

const api = window.cleaner;
const viewEl = document.getElementById('view')!;

let state: AppState | null = null;
let view: View = 'home';
let error: string | null = null;

const deep = {
  selected: null as Set<CategoryId> | null,
  preview: null as DeepScanPreview | null,
  toDelete: new Set<CategoryId>(),
  expanded: new Set<CategoryId>(),
  confirming: false,
  result: null as RunRecord | null,
};

const expandedRuns = new Set<string>();

// ---------------------------------------------------------------------------
// Tiny DOM helper. Text is always set through textContent, never innerHTML.

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

function h(tag: string, attrs: Attrs = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = String(value);
    } else if (key === 'style') {
      // CSSOM writes are allowed by the page's CSP, style attributes are not.
      el.style.cssText = String(value);
    } else if (key === 'checked' || key === 'disabled' || key === 'value') {
      (el as unknown as Record<string, unknown>)[key] = value;
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

// ---------------------------------------------------------------------------
// Formatting

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);

  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === -1) return `Yesterday ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`;
}

const MODE_LABEL: Record<RunMode, string> = {
  auto: 'Auto',
  quick: 'Manual',
  deep: 'Deep',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// Actions

async function act<T>(fn: () => Promise<T>): Promise<T | undefined> {
  error = null;
  try {
    return await fn();
  } catch (e) {
    error = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e);
    render();
    return undefined;
  }
}

async function updateSettings(patch: SettingsPatch): Promise<void> {
  const next = await act(() => api.updateSettings(patch));
  if (next) {
    state = next;
    render();
  }
}

async function quickClean(): Promise<void> {
  await act(() => api.runQuickClean());
}

async function runDeepScan(): Promise<void> {
  const ids = [...(deep.selected ?? [])];
  deep.result = null;
  deep.confirming = false;
  const preview = await act(() => api.scanDeep(ids));
  if (preview) {
    deep.preview = preview;
    deep.toDelete = new Set(preview.categories.filter((c) => c.totalSize > 0 && c.safetyLevel !== 'risky').map((c) => c.id));
    render();
  }
}

async function runDeepClean(): Promise<void> {
  const ids = [...deep.toDelete];
  deep.confirming = false;
  const record = await act(() => api.cleanDeep(ids));
  if (record) {
    deep.result = record;
    deep.preview = null;
    render();
  } else if (error?.includes('out of date')) {
    // The main process refuses to delete from an old preview: go back so the user rescans.
    deep.preview = null;
    render();
  }
}

// ---------------------------------------------------------------------------
// Shared pieces

function badge(text: string, kind: string): HTMLElement {
  return h('span', { class: `badge ${kind}` }, text);
}

function progressCard(s: AppState): HTMLElement | null {
  const { status } = s;
  if (status.phase === 'idle') return null;
  const pct = status.total ? Math.round(((status.completed ?? 0) / status.total) * 100) : 0;
  const verb = status.phase === 'scanning' ? 'Scanning' : 'Cleaning';
  return h(
    'div',
    { class: 'card' },
    h(
      'div',
      { class: 'row' },
      h('div', { class: 'spinner' }),
      h('div', { class: 'grow ellipsis', style: 'flex:1' }, `${verb}${status.current ? ` ${status.current}` : ''}…`),
      h('span', { class: 'muted small' }, status.total ? `${status.completed}/${status.total}` : '')
    ),
    h('div', { class: 'bar' }, h('span', { style: `width:${pct}%` }))
  );
}

function errorBanner(): HTMLElement | null {
  if (!error) return null;
  return h('div', { class: 'banner' }, h('div', { class: 'danger-text' }, error));
}

function fdaBanner(s: AppState): HTMLElement | null {
  if (s.fullDiskAccess !== false) return null;
  return h(
    'div',
    { class: 'banner' },
    h('strong', {}, 'Full Disk Access needed'),
    h(
      'div',
      { class: 'small' },
      'Without it some caches cannot be read or removed. Enable Mac Cleaner in Privacy & Security → Full Disk Access.'
    ),
    h('button', { class: 'btn link', onclick: () => void api.openFullDiskAccessSettings() }, 'Open System Settings →')
  );
}

function runBreakdown(record: RunRecord): HTMLElement {
  const rows = record.categories.filter((c) => c.cleanedItems > 0 || c.errors.length > 0);
  // Scanner failures live on the run, not on a category.
  const scanErrors = (record.errors ?? []).map((message) =>
    h('div', { class: 'list-item' }, h('div', { class: 'grow small danger-text' }, message))
  );
  if (rows.length === 0 && scanErrors.length === 0) {
    return h('div', { class: 'muted small' }, 'Nothing needed to be removed.');
  }
  return h(
    'div',
    { class: 'list' },
    ...scanErrors,
    ...rows.map((c) =>
      h(
        'div',
        { class: 'list-item' },
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'ellipsis' }, c.name),
          h(
            'div',
            { class: 'muted small ellipsis' },
            `${c.cleanedItems} item${c.cleanedItems === 1 ? '' : 's'}${c.errors.length ? ` · ${c.errors.join('; ')}` : ''}`
          )
        ),
        h('span', { class: 'size' }, formatSize(c.freedSpace))
      )
    )
  );
}

// ---------------------------------------------------------------------------
// Views

function renderHome(s: AppState): Child[] {
  const busy = s.status.phase !== 'idle';
  const last = s.history[0];
  const diskUsed = s.disk ? 1 - s.disk.free / s.disk.total : 0;
  const diskClass = diskUsed > 0.95 ? 'danger' : diskUsed > 0.85 ? 'warn' : '';

  const autoLine = s.settings.autoClean.enabled
    ? s.nextAutoRunAt
      ? `Next automatic clean: ${formatWhen(s.nextAutoRunAt)}`
      : 'Automatic clean has no categories selected'
    : 'Automatic clean is off';

  return [
    errorBanner(),
    fdaBanner(s),
    s.disk &&
      h(
        'div',
        { class: 'card' },
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'card-title' }, 'Disk'),
          h('span', { class: 'muted small' }, `${formatSize(s.disk.free)} free of ${formatSize(s.disk.total)}`)
        ),
        h('div', { class: `bar ${diskClass}` }, h('span', { style: `width:${Math.round(diskUsed * 100)}%` }))
      ),
    progressCard(s),
    h(
      'div',
      { class: 'card' },
      h('span', { class: 'card-title' }, 'Freed so far'),
      h('div', { class: 'big-number' }, formatSize(s.totalFreed)),
      h('div', { class: 'muted small' }, autoLine)
    ),
    h(
      'div',
      { class: 'buttons' },
      h('button', { class: 'btn primary', disabled: busy, onclick: () => void quickClean() }, 'Clean Now'),
      h('button', { class: 'btn', disabled: busy, onclick: () => setView('deep') }, 'Deep Clean…')
    ),
    last &&
      h(
        'div',
        { class: 'card' },
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'card-title' }, 'Last clean'),
          h('span', {}, badge(MODE_LABEL[last.mode], last.mode === 'auto' ? 'auto' : ''))
        ),
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'muted small' }, formatWhen(last.finishedAt)),
          h('strong', { class: last.freedSpace > 0 ? 'success-text' : '' }, `${formatSize(last.freedSpace)} freed`)
        ),
        runBreakdown(last)
      ),
  ];
}

function renderDeep(s: AppState): Child[] {
  const busy = s.status.phase !== 'idle';

  if (!deep.selected) {
    deep.selected = new Set(s.categories.filter((c) => c.safetyLevel !== 'risky').map((c) => c.id));
  }

  if (deep.result) {
    const r = deep.result;
    return [
      errorBanner(),
      h(
        'div',
        { class: 'card' },
        h('span', { class: 'card-title' }, 'Deep clean finished'),
        h('div', { class: 'big-number success-text' }, formatSize(r.freedSpace)),
        h('div', { class: 'muted small' }, `${r.cleanedItems} items permanently deleted`),
        runBreakdown(r)
      ),
      h(
        'div',
        { class: 'buttons' },
        h('button', { class: 'btn', onclick: () => { deep.result = null; render(); } }, 'Done')
      ),
    ];
  }

  if (deep.preview) {
    const p = deep.preview;
    const selectedSize = p.categories.filter((c) => deep.toDelete.has(c.id)).reduce((sum, c) => sum + c.totalSize, 0);
    const selectedItems = p.categories.filter((c) => deep.toDelete.has(c.id)).reduce((sum, c) => sum + c.itemCount, 0);
    const found = p.categories.filter((c) => c.totalSize > 0 || c.error);

    return [
      errorBanner(),
      progressCard(s),
      h(
        'div',
        { class: 'card' },
        h(
          'div',
          { class: 'row' },
          h('span', { class: 'card-title' }, 'Found'),
          h('span', { class: 'muted small' }, formatSize(p.totalSize))
        ),
        found.length === 0
          ? h('div', { class: 'empty' }, 'Nothing to clean. 🎉')
          : h(
              'div',
              { class: 'list' },
              ...found.flatMap((c) => {
                const open = deep.expanded.has(c.id);
                return [
                  h(
                    'div',
                    { class: 'list-item' },
                    h('input', {
                      type: 'checkbox',
                      checked: deep.toDelete.has(c.id),
                      disabled: busy || c.totalSize === 0,
                      onchange: (e: Event) => {
                        if ((e.target as HTMLInputElement).checked) deep.toDelete.add(c.id);
                        else deep.toDelete.delete(c.id);
                        deep.confirming = false;
                        render();
                      },
                    }),
                    h(
                      'div',
                      {
                        class: 'grow',
                        onclick: () => {
                          if (open) deep.expanded.delete(c.id);
                          else deep.expanded.add(c.id);
                          render();
                        },
                      },
                      h('div', { class: 'ellipsis' }, `${open ? '▾' : '▸'} ${c.name} `, badge(c.safetyLevel, c.safetyLevel)),
                      h(
                        'div',
                        { class: 'muted small ellipsis' },
                        c.error ? c.error : `${c.itemCount} item${c.itemCount === 1 ? '' : 's'}`
                      )
                    ),
                    h('span', { class: 'size' }, formatSize(c.totalSize))
                  ),
                  open &&
                    h(
                      'div',
                      { class: 'details' },
                      c.safetyNote && h('div', { class: 'small muted' }, `⚠︎ ${c.safetyNote}`),
                      ...c.topItems.map((item) =>
                        h(
                          'div',
                          { class: 'row' },
                          h(
                            'span',
                            {
                              class: 'path-link ellipsis',
                              title: item.path,
                              onclick: () => void api.revealPath(item.path),
                            },
                            item.name
                          ),
                          h('span', { class: 'size muted' }, formatSize(item.size))
                        )
                      ),
                      c.itemCount > c.topItems.length &&
                        h('div', { class: 'small muted' }, `…and ${c.itemCount - c.topItems.length} more`)
                    ),
                ];
              })
            )
      ),
      deep.confirming
        ? h(
            'div',
            { class: 'banner' },
            h('strong', {}, `Permanently delete ${selectedItems} items (${formatSize(selectedSize)})?`),
            h('div', { class: 'small' }, 'Files are removed directly, not moved to the Trash. This cannot be undone.'),
            h(
              'div',
              { class: 'buttons' },
              h('button', { class: 'btn', onclick: () => { deep.confirming = false; render(); } }, 'Cancel'),
              h('button', { class: 'btn danger', disabled: busy, onclick: () => void runDeepClean() }, 'Delete')
            )
          )
        : h(
            'div',
            { class: 'buttons' },
            h('button', { class: 'btn', disabled: busy, onclick: () => { deep.preview = null; render(); } }, 'Back'),
            h(
              'button',
              {
                class: 'btn danger',
                disabled: busy || deep.toDelete.size === 0 || selectedSize === 0,
                onclick: () => { deep.confirming = true; render(); },
              },
              `Delete ${formatSize(selectedSize)}`
            )
          ),
    ];
  }

  const byLevel = (level: CategoryInfo['safetyLevel']) => s.categories.filter((c) => c.safetyLevel === level);
  const categoryRow = (c: CategoryInfo) =>
    h(
      'label',
      { class: 'list-item' },
      h('input', {
        type: 'checkbox',
        checked: deep.selected!.has(c.id),
        disabled: busy,
        onchange: (e: Event) => {
          if ((e.target as HTMLInputElement).checked) deep.selected!.add(c.id);
          else deep.selected!.delete(c.id);
          render();
        },
      }),
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'ellipsis' }, c.name),
        h('div', { class: 'muted small ellipsis', title: c.safetyNote ?? c.description }, c.safetyNote ?? c.description)
      )
    );

  return [
    errorBanner(),
    fdaBanner(s),
    progressCard(s),
    h(
      'div',
      { class: 'card' },
      h('span', { class: 'card-title' }, 'Deep clean'),
      h(
        'div',
        { class: 'muted small' },
        'Scans more places than the daily clean and lets you permanently delete what it finds. Nothing is removed until you confirm.'
      ),
      h('div', { class: 'group-title' }, 'Safe & moderate'),
      h('div', { class: 'list' }, ...[...byLevel('safe'), ...byLevel('moderate')].map(categoryRow)),
      h('div', { class: 'group-title danger-text' }, 'Risky — review before deleting'),
      h('div', { class: 'list' }, ...byLevel('risky').map(categoryRow))
    ),
    h(
      'div',
      { class: 'buttons' },
      h(
        'button',
        { class: 'btn primary', disabled: busy || deep.selected.size === 0, onclick: () => void runDeepScan() },
        `Scan ${deep.selected.size} categor${deep.selected.size === 1 ? 'y' : 'ies'}`
      )
    ),
  ];
}

function renderHistory(s: AppState): Child[] {
  if (s.history.length === 0) {
    return [h('div', { class: 'empty' }, 'No cleans yet. The first automatic clean will show up here.')];
  }
  return [
    h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'card-title' }, `${s.history.length} runs`),
        h('span', { class: 'muted small' }, `${formatSize(s.totalFreed)} freed in total`)
      ),
      h(
        'div',
        { class: 'list' },
        ...s.history.flatMap((r) => {
          const open = expandedRuns.has(r.id);
          return [
            h(
              'div',
              {
                class: 'list-item',
                onclick: () => {
                  if (open) expandedRuns.delete(r.id);
                  else expandedRuns.add(r.id);
                  render();
                },
              },
              h('span', { class: 'muted' }, open ? '▾' : '▸'),
              h(
                'div',
                { class: 'grow' },
                h('div', {}, formatWhen(r.finishedAt), ' ', badge(MODE_LABEL[r.mode], r.mode === 'auto' ? 'auto' : '')),
                h('div', { class: 'muted small' }, `${r.cleanedItems} items`)
              ),
              h('span', { class: 'size' }, formatSize(r.freedSpace))
            ),
            open && h('div', { class: 'details' }, runBreakdown(r)),
          ];
        })
      )
    ),
    h(
      'div',
      { class: 'footer' },
      h('span', {}),
      h('button', { class: 'btn link', onclick: () => void act(() => api.clearHistory()).then((st) => { if (st) { state = st; render(); } }) }, 'Clear history')
    ),
  ];
}

function toggleRow(label: string, hint: string | null, checked: boolean, onChange: (value: boolean) => void): HTMLElement {
  return h(
    'label',
    { class: 'list-item' },
    h('div', { class: 'grow' }, h('div', {}, label), hint && h('div', { class: 'muted small' }, hint)),
    h('input', {
      type: 'checkbox',
      class: 'toggle',
      checked,
      onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked),
    })
  );
}

function renderSettings(s: AppState): Child[] {
  const auto = s.settings.autoClean;
  const autoCategories = s.categories.filter((c) => c.safetyLevel !== 'risky');

  return [
    errorBanner(),
    h(
      'div',
      { class: 'card' },
      h('span', { class: 'card-title' }, 'Automatic clean'),
      h(
        'div',
        { class: 'list' },
        toggleRow('Clean every day', 'Runs quietly in the background', auto.enabled, (v) =>
          void updateSettings({ autoClean: { enabled: v } })
        ),
        h(
          'div',
          { class: 'list-item' },
          h('div', { class: 'grow' }, h('div', {}, 'Time'), h('div', { class: 'muted small' }, 'Runs on wake if your Mac was asleep')),
          h('input', {
            type: 'time',
            value: `${pad(auto.hour)}:${pad(auto.minute)}`,
            disabled: !auto.enabled,
            onchange: (e: Event) => {
              const [hour, minute] = (e.target as HTMLInputElement).value.split(':').map(Number);
              void updateSettings({ autoClean: { hour, minute } });
            },
          })
        ),
        h(
          'div',
          { class: 'list-item' },
          h(
            'div',
            { class: 'grow' },
            h('div', {}, 'Keep recent temp files'),
            h('div', { class: 'muted small' }, 'Hours a temp file must be untouched before it is removed')
          ),
          h('input', {
            type: 'number',
            min: 0,
            max: 720,
            value: String(auto.tempFilesMinAgeHours),
            onchange: (e: Event) =>
              void updateSettings({ autoClean: { tempFilesMinAgeHours: Number((e.target as HTMLInputElement).value) } }),
          })
        )
      ),
      h('div', { class: 'group-title' }, 'What gets cleaned automatically'),
      h(
        'div',
        { class: 'list' },
        ...autoCategories.map((c) =>
          h(
            'label',
            { class: 'list-item' },
            h('input', {
              type: 'checkbox',
              checked: auto.categories.includes(c.id),
              onchange: (e: Event) => {
                const set = new Set(auto.categories);
                if ((e.target as HTMLInputElement).checked) set.add(c.id);
                else set.delete(c.id);
                void updateSettings({ autoClean: { categories: [...set] } });
              },
            }),
            h(
              'div',
              { class: 'grow' },
              h('div', { class: 'ellipsis' }, `${c.name} `, badge(c.safetyLevel, c.safetyLevel)),
              h('div', { class: 'muted small ellipsis', title: c.description }, c.description)
            )
          )
        )
      ),
      h('div', { class: 'muted small' }, 'Risky categories (downloads, backups, large files…) are only available in Deep Clean.')
    ),
    h(
      'div',
      { class: 'card' },
      h('span', { class: 'card-title' }, 'General'),
      h(
        'div',
        { class: 'list' },
        toggleRow('Notify after automatic clean', null, s.settings.notifyAfterAutoClean, (v) =>
          void updateSettings({ notifyAfterAutoClean: v })
        ),
        toggleRow('Show freed space in menu bar', null, s.settings.showFreedInMenuBar, (v) =>
          void updateSettings({ showFreedInMenuBar: v })
        ),
        toggleRow('Launch at login', 'Needed for the daily clean to run', s.settings.launchAtLogin, (v) =>
          void updateSettings({ launchAtLogin: v })
        )
      )
    ),
    h(
      'div',
      { class: 'footer' },
      h('span', { class: 'muted small' }, `Mac Cleaner ${s.version}`),
      h('button', { class: 'btn link', onclick: () => void api.quit() }, 'Quit Mac Cleaner')
    ),
  ];
}

// ---------------------------------------------------------------------------

function setView(next: View): void {
  view = next;
  error = null;
  viewEl.scrollTop = 0;
  render(true);
}

function render(force = false): void {
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.dataset.view === view));
  });
  if (!state) return;

  // Don't yank an input out from under the user while they are editing it.
  const active = document.activeElement;
  if (!force && active instanceof HTMLInputElement && viewEl.contains(active) && active.type !== 'checkbox') {
    return;
  }

  const scroll = viewEl.scrollTop;
  const renderers: Record<View, (s: AppState) => Child[]> = {
    home: renderHome,
    deep: renderDeep,
    history: renderHistory,
    settings: renderSettings,
  };
  const children = renderers[view](state).filter((c): c is Node | string => Boolean(c));
  viewEl.replaceChildren(...children);
  viewEl.scrollTop = scroll;
}

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) => {
  tab.addEventListener('click', () => setView(tab.dataset.view as View));
});

api.onStateChanged((next) => {
  state = next;
  render();
});

void api.getState().then((initial) => {
  state = initial;
  render(true);
});
