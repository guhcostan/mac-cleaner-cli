import { createPrompt, isDownKey, isEnterKey, isUpKey, useEffect, useKeypress, useRef, useState } from '@inquirer/core';
import chalk from 'chalk';
import type { CategoryId, ScannerOptions, ScanSummary } from '../types.js';
import { CATEGORIES } from '../types.js';
import { formatSize, sanitizeDisplayName } from '../utils/index.js';
import { addLiveRow, canSubmitLive, initialLiveState, liveKey, liveView, toggleLiveRow, type LiveState } from './live-review-state.js';

export interface LiveReviewResult { summary: ScanSummary; selected: Map<CategoryId, Set<string>>; cancelled: boolean }
interface LiveConfig {
  scan: (options: ScannerOptions) => Promise<ScanSummary>;
  readOnly?: boolean;
  includeRisky?: boolean;
}
/** Same supported Inquirer prompt infrastructure as the ordinary file picker. */
export const liveReviewPrompt = createPrompt<LiveReviewResult, LiveConfig>((config, done) => {
  const [state, setState] = useState(initialLiveState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [summary, setSummary] = useState<ScanSummary>();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [warnings, setWarnings] = useState(0);
  const warningCount = useRef(0);
  const abort = useRef(new AbortController());
  function update(next: LiveState) { stateRef.current = next; setState(next); }
  useEffect(() => {
    let disposed = false;
    void config.scan({ signal: abort.current.signal, onEvent: (event) => {
      if (disposed) return;
      if (event.type === 'candidate' && (config.readOnly || config.includeRisky || CATEGORIES[event.category].safetyLevel !== 'risky')) update(addLiveRow(stateRef.current, { category: event.category, item: event.item }));
      if (event.type === 'warning') setWarnings(++warningCount.current);
      if (event.type === 'progress') setMessage('Discovering and checking candidates…');
    } }).then((scanned) => {
      if (disposed) return;
      setSummary(scanned);
      update({ ...stateRef.current, scanning: false, cancelled: !!scanned.cancelled });
      setMessage(scanned.cancelled ? 'Scan cancelled' : 'Scan complete. Enter finishes review.');
    }).catch((error: unknown) => {
      if (disposed) return;
      update({ ...stateRef.current, scanning: false, cancelled: true });
      setMessage(`Scan failed: ${String(error)}`);
    });
    return () => { disposed = true; abort.current.abort(); };
  }, []);
  const view = liveView(state);
  useKeypress((key, rl) => {
    if (editing) {
      if (isEnterKey(key) || key.name === 'escape') setEditing(false);
      else if (!key.ctrl) update({ ...state, query: rl.line, page: 0, cursor: 0 });
      return;
    }
    if (key.name === 'q' || key.name === 'escape') {
      abort.current.abort();
      done({ summary: summary ?? { results: [], totalSize: 0, totalItems: 0, cancelled: true }, selected: new Map(), cancelled: true });
    } else if (isEnterKey(key)) {
      if (!canSubmitLive(state) || !summary) { setMessage('Still scanning — Enter cannot submit cleanup. Use q to cancel.'); return; }
      const selected = new Map<CategoryId, Set<string>>();
      if (!config.readOnly) for (const row of state.rows) if (state.selected.has(liveKey(row))) {
        const paths = selected.get(row.category) ?? new Set<string>(); paths.add(row.item.path); selected.set(row.category, paths);
      }
      done({ summary, selected, cancelled: false });
    } else if (isDownKey(key)) update({ ...state, cursor: Math.max(0, Math.min(state.cursor + 1, view.rows.length - 1)) });
    else if (isUpKey(key)) update({ ...state, cursor: Math.max(0, state.cursor - 1) });
    else if (key.name === 'space' && !config.readOnly && view.rows[state.cursor]) update(toggleLiveRow(state, view.rows[state.cursor]));
    else if (key.name === 'n' || key.name === 'right') update({ ...state, page: Math.min(view.page + 1, view.pages - 1), cursor: 0 });
    else if (key.name === 'b' || key.name === 'left') update({ ...state, page: Math.max(view.page - 1, 0), cursor: 0 });
    else if (['s', 'm', 'p'].includes(key.name ?? '')) update({ ...state, sort: key.name === 's' ? 'size' : key.name === 'm' ? 'mtime' : 'path', cursor: 0 });
    else if (rl.line === '/') { setEditing(true); rl.clearLine(0); rl.write(state.query); return; }
    rl.clearLine(0);
  });
  const rows = view.rows.map((row, index) => {
    const label = `${index === state.cursor ? '❯' : ' '} ${state.selected.has(liveKey(row)) ? '[x]' : '[ ]'} ${formatSize(row.item.size).padStart(10)} ${sanitizeDisplayName(row.item.path)}`;
    return CATEGORIES[row.category].safetyLevel === 'risky' ? chalk.yellow(label) : label;
  });
  return [
    chalk.bold(`Live repository review${config.readOnly ? ' (read only)' : ''} — ${state.scanning ? 'scanning' : 'complete'}`),
    `${state.rows.length} candidates • ${state.selected.size} selected • ${warnings} warnings • page ${view.page + 1}/${view.pages} • sort ${state.sort}`,
    `Search${editing ? ' (type, Enter to finish)' : ''}: ${sanitizeDisplayName(state.query)}`,
    ...rows,
    chalk.dim('↑/↓ move • space select • s size / m modified / p path • / search • n/b pages • q cancel'),
    chalk.dim('Enter finishes review after scanning. Cleanup requires a separate confirmation.'),
    message,
  ].join('\n');
});
