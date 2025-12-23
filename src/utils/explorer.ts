import chalk from 'chalk';
import type { CleanableItem } from '../types.js';
import { getDirectoryItems } from './fs.js';
import { formatSize } from './size.js';
import { explorerPrompt } from './explorer-prompt.js';

interface ExplorerOptions {
  pageSize?: number;
}

async function runExplorerLoop(
  rootItems: CleanableItem[],
  selectedItems: CleanableItem[],
  options: ExplorerOptions
): Promise<CleanableItem[]> {
  interface StackFrame {
    path: string | null;
    items: CleanableItem[];
  }

  const stack: StackFrame[] = [{ path: null, items: rootItems }];

  while (true) {
    const currentFrame = stack[stack.length - 1];
    const isRoot = currentFrame.path === null;

    const choiceItems = currentFrame.items.map((item) => {
      const isDirectory = item.isDirectory;
      const icon = isDirectory ? '📂' : '📄';
      const nameStr = item.name.substring(0, 40).padEnd(40);
      const sizeStr = chalk.yellow(formatSize(item.size).padStart(10));

      return {
        name: `${icon} ${nameStr} ${sizeStr}`,
        value: item.path,
        checked: selectedItems.some((s) => s.path === item.path),
        isDirectory,
        disabled: false,
      };
    });

    choiceItems.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) return 0;
      return a.isDirectory ? -1 : 1;
    });

    const result = await explorerPrompt({
      message: `Browsing: ${currentFrame.path ?? 'Root Scan Results'}`,
      choices: choiceItems,
      pageSize: options.pageSize || 15,
      loop: false,
    });

    // Sync selections for current view
    const currentPathsInView = new Set(choiceItems.map((c) => c.value));
    const selectedPaths = new Set(result.value);

    for (const item of currentFrame.items) {
      if (selectedPaths.has(item.path)) {
        if (!selectedItems.some((s) => s.path === item.path)) {
          selectedItems.push(item);
        }
        continue;
      }

      if (currentPathsInView.has(item.path)) {
        const idx = selectedItems.findIndex((s) => s.path === item.path);
        if (idx !== -1) {
          selectedItems.splice(idx, 1);
        }
      }
    }

    if (result.action === 'GO_UP') {
      if (isRoot) {
        return selectedItems;
      }
      stack.pop();
      continue;
    }

    if (result.action === 'ENTER_DIR') {
      const targetPath = result.target;
      if (!targetPath) continue;

      const newItems = await getDirectoryItems(targetPath);
      stack.push({
        path: targetPath,
        items: newItems,
      });
      continue;
    }

    return selectedItems;
  }
}

export async function runFileExplorer(
  initialItems: CleanableItem[],
  options: ExplorerOptions = {}
): Promise<CleanableItem[]> {
  return runExplorerLoop(initialItems, [], options);
}
