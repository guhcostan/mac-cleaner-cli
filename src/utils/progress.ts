import chalk from 'chalk';

export interface ProgressOptions {
  total: number;
  label?: string;
  showPercentage?: boolean;
  showCount?: boolean;
  barWidth?: number;
}

export class ProgressBar {
  private current = 0;
  private total: number;
  private label: string;
  private showPercentage: boolean;
  private showCount: boolean;
  private barWidth: number;
  private startTime: number;
  private lastRender = '';

  constructor(options: ProgressOptions) {
    this.total = options.total;
    this.label = options.label ?? '';
    this.showPercentage = options.showPercentage ?? true;
    this.showCount = options.showCount ?? true;
    this.barWidth = options.barWidth ?? 30;
    this.startTime = Date.now();
  }

  update(current: number, label?: string): void {
    this.current = current;
    if (label) this.label = label;
    this.render();
  }

  increment(label?: string): void {
    this.update(this.current + 1, label);
  }

  private render(): void {
    const percentage = Math.min(100, Math.round((this.current / this.total) * 100));
    const filledWidth = Math.round((percentage / 100) * this.barWidth);
    const emptyWidth = this.barWidth - filledWidth;

    const filled = chalk.green('█'.repeat(filledWidth));
    const empty = chalk.dim('░'.repeat(emptyWidth));
    const bar = `${filled}${empty}`;

    const parts: string[] = [];

    if (this.label) {
      parts.push(chalk.cyan(this.label.substring(0, 25).padEnd(25)));
    }

    parts.push(bar);

    if (this.showPercentage) {
      parts.push(chalk.yellow(`${percentage.toString().padStart(3)}%`));
    }

    if (this.showCount) {
      parts.push(chalk.dim(`(${this.current}/${this.total})`));
    }

    const elapsed = Date.now() - this.startTime;
    if (elapsed > 1000 && this.current > 0) {
      const eta = Math.round((elapsed / this.current) * (this.total - this.current) / 1000);
      if (eta > 0) {
        parts.push(chalk.dim(`~${eta}s`));
      }
    }

    const output = parts.join(' ');

    if (output !== this.lastRender) {
      process.stdout.write(`\r${output}`);
      this.lastRender = output;
    }
  }

  finish(message?: string): void {
    process.stdout.write('\r' + ' '.repeat(this.lastRender.length) + '\r');
    if (message) {
      console.log(message);
    }
  }
}

export function createScanProgress(total: number): ProgressBar {
  return new ProgressBar({
    total,
    label: 'Scanning...',
    barWidth: 25,
  });
}

export function createCleanProgress(total: number): ProgressBar {
  return new ProgressBar({
    total,
    label: 'Cleaning...',
    barWidth: 25,
  });
}




