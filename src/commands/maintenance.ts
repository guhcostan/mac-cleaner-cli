import chalk from 'chalk';
import ora from 'ora';
import { flushDnsCache, freePurgeableSpace, type MaintenanceResult } from '../maintenance/index.js';

interface MaintenanceCommandOptions {
  dns?: boolean;
  purgeable?: boolean;
}

export async function maintenanceCommand(options: MaintenanceCommandOptions): Promise<void> {
  const tasks: { name: string; fn: () => Promise<MaintenanceResult> }[] = [];

  if (options.dns) {
    tasks.push({ name: 'Flush DNS Cache', fn: flushDnsCache });
  }

  if (options.purgeable) {
    tasks.push({ name: 'Free Purgeable Space', fn: freePurgeableSpace });
  }

  if (tasks.length === 0) {
    console.log(chalk.yellow('\nNo maintenance tasks specified.'));
    console.log(chalk.dim('Use --dns to flush DNS cache or --purgeable to free purgeable space.\n'));
    return;
  }

  console.log();
  console.log(chalk.bold('Running Maintenance Tasks'));
  console.log(chalk.dim('─'.repeat(50)));

  for (const task of tasks) {
    const spinner = ora(task.name).start();

    const result = await task.fn();

    if (result.success) {
      spinner.succeed(chalk.green(result.message));
    } else {
      if (result.error) {
        spinner.fail(chalk.red(`${result.message}: ${result.error}`));
      } else {
        spinner.fail(chalk.red(result.message));
      }
    }
  }

  console.log();
}


