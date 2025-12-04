import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface MaintenanceResult {
  success: boolean;
  message: string;
  error?: string;
}

export async function freePurgeableSpace(): Promise<MaintenanceResult> {
  try {
    await execAsync('purge');

    return {
      success: true,
      message: 'Purgeable space freed successfully',
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to free purgeable space',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}


