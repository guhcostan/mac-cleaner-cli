import chalk from 'chalk';
import confirm from '@inquirer/confirm';
import ora from 'ora';
import {
  flushDnsCache,
  freePurgeableSpace,
  clearTimeMachineSnapshots,
  listTimeMachineSnapshotDates,
  type MaintenanceResult,
} from '../maintenance/index.js';

interface MaintenanceCommandOptions {
  dns?: boolean;
  purgeable?: boolean;
  timemachine?: boolean;
  yes?: boolean;
  dryRun?: boolean;
}

export async function maintenanceCommand(options: MaintenanceCommandOptions): Promise<void> {
  const tasks: { name: string; fn: () => Promise<MaintenanceResult> }[] = [];

  if (options.dns) {
    tasks.push({ name: 'Flush DNS Cache', fn: flushDnsCache });
  }

  if (options.purgeable) {
    tasks.push({ name: 'Free Purgeable Space', fn: freePurgeableSpace });
  }

  if (options.timemachine) {
    const task = await prepareTimeMachineTask(options);
    if (task) {
      tasks.push(task);
    }
  }

  if (tasks.length === 0) {
    if (!options.dns && !options.purgeable && !options.timemachine) {
      console.log(chalk.yellow('\nNo maintenance tasks specified.'));
      console.log(chalk.dim('Use --dns, --purgeable, or --timemachine for maintenance tasks.\n'));
    }
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

/**
 * Deleting local snapshots is irreversible, so the snapshots are listed and
 * confirmed before any deletion runs. Listing happens here (outside the spinner
 * loop) so the prompt is not drawn over by the spinner.
 */
async function prepareTimeMachineTask(
  options: MaintenanceCommandOptions
): Promise<{ name: string; fn: () => Promise<MaintenanceResult> } | null> {
  const name = 'Clear Time Machine Snapshots';
  const listed = await listTimeMachineSnapshotDates();

  if (listed.error) {
    const error = listed.error;
    return {
      name,
      fn: async () => ({
        success: false,
        message: 'Failed to list Time Machine snapshots',
        error,
      }),
    };
  }

  const dates = listed.dates;

  if (dates.length === 0) {
    return {
      name,
      fn: async () => ({ success: true, message: 'No Time Machine local snapshots found' }),
    };
  }

  if (!options.yes && !options.dryRun) {
    console.log(chalk.yellow(`\nFound ${dates.length} Time Machine local snapshot(s).`));
    console.log(
      chalk.dim(
        'Deleting them is irreversible. macOS recreates snapshots automatically once a backup disk is connected.'
      )
    );

    const proceed = await confirm({
      message: `Delete ${dates.length} local snapshot${dates.length !== 1 ? 's' : ''}?`,
      default: false,
    });

    if (!proceed) {
      console.log(chalk.yellow('\nTime Machine snapshot deletion cancelled.\n'));
      return null;
    }
  }

  return { name, fn: () => clearTimeMachineSnapshots({ dates, dryRun: options.dryRun }) };
}
