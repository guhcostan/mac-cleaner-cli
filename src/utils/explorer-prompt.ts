import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  usePagination,
  useRef,
  isEnterKey,
  type Theme,
} from '@inquirer/core';
import chalk from 'chalk';

type Item = {
  name: string;
  value: string;
  disabled?: boolean | string;
  isDirectory?: boolean;
  checked?: boolean;
};

type ExplorerConfig = {
  message: string;
  choices: Item[];
  pageSize?: number;
  theme?: Partial<Theme>;
  loop?: boolean;
};

type ExplorerValue = {
  value: string[];
  action?: 'ENTER_DIR' | 'GO_UP';
  target?: string;
};

export const explorerPrompt = createPrompt<ExplorerValue, ExplorerConfig>((config, done) => {
  const { choices, pageSize = 15, loop = false } = config;
  const [status, setStatus] = useState<string>('pending');
  // We maintain a set of selected indexes or values
  const [checked, setChecked] = useState<Set<string>>(new Set(choices.filter((c) => c.checked).map((c) => c.value)));
  const [active, setActive] = useState(0);
  const prefix = usePrefix({ status });
  const firstRender = useRef(true);

  // Define icons locally to avoid Theme type issues
  const icons = {
    checked: chalk.green('◉'),
    unchecked: chalk.dim('◯'),
    cursor: chalk.cyan('❯'),
  };

  const selectableValues = choices.filter((c) => !c.disabled).map((c) => c.value);

  useKeypress((key) => {
    if (isEnterKey(key)) {
      setStatus('done');
      done({
        value: Array.from(checked),
      });
      return;
    }

    if (key.name === 'up' || key.name === 'k') {
      const nextIndex = active > 0 ? active - 1 : (loop ? choices.length - 1 : 0);
      setActive(nextIndex);
    } else if (key.name === 'down' || key.name === 'j') {
      const nextIndex = active < choices.length - 1 ? active + 1 : (loop ? 0 : active);
      setActive(nextIndex);
    } else if (key.name === 'space') {
      if (choices.length === 0) return;
      const item = choices[active];
      if (item.disabled) {
        // do nothing for disabled
      } else {
        // Normal item toggle
        const nextChecked = new Set(checked);
        if (nextChecked.has(item.value)) {
          nextChecked.delete(item.value);
        } else {
          nextChecked.add(item.value);
        }
        setChecked(nextChecked);
      }
    } else if (key.name === 'a') {
      // Toggle all
      const nextChecked = new Set(checked);
      const allSelected = selectableValues.every((value) => nextChecked.has(value));

      if (allSelected) {
        for (const value of selectableValues) nextChecked.delete(value);
      } else {
        for (const value of selectableValues) nextChecked.add(value);
      }
      setChecked(nextChecked);
    } else if (key.name === 'i') {
      // Invert selection
      const nextChecked = new Set(checked);
      for (const value of selectableValues) {
        if (nextChecked.has(value)) nextChecked.delete(value);
        else nextChecked.add(value);
      }
      setChecked(nextChecked);
    } else if (key.name === 'right' || key.name === 'l') {
      if (choices.length === 0) return;
      // Enter directory
      const item = choices[active];
      if (item.isDirectory) {
        setStatus('done');
        done({
          value: Array.from(checked),
          action: 'ENTER_DIR',
          target: item.value,
        });
      }
    } else if (key.name === 'left' || key.name === 'h') {
      // Go up
      setStatus('done');
      done({
        value: Array.from(checked),
        action: 'GO_UP',
      });
    }
  });

  const page = usePagination<Item>({
    items: choices,
    active,
    renderItem: ({ item, isActive }) => {
      // Checkbox look
      const cursor = isActive ? icons.cursor : ' ';
      const isChecked = checked.has(item.value);
      const icon = isChecked ? icons.checked : icons.unchecked;
      
      let label = item.name;
      if (item.disabled) {
        label = chalk.dim(label);
      }
      
      return `${cursor} ${icon} ${label}`;
    },
    pageSize,
    loop,
  });

  const navigationHelp = chalk.dim('↑↓ navigate • ← back • → enter • space select • a all • i invert • ⏎ submit');

  if (firstRender.current) {
    firstRender.current = false;
    return `${prefix} ${chalk.bold(config.message)}\n${page}\n${navigationHelp}`;
  }

  return `${prefix} ${chalk.bold(config.message)}\n${page}\n${navigationHelp}`;
});
