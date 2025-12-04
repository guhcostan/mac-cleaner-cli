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
    await execAsync('sudo -n purge');

    return {
      success: true,
      message: 'Purgeable space freed successfully',
    };
  } catch {
    try {
      await execAsync('purge');

      return {
        success: true,
        message: 'Purgeable space freed successfully',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const needsSudo = errorMessage.includes('Operation not permitted');

      return {
        success: false,
        message: 'Failed to free purgeable space',
        error: needsSudo
          ? 'Requires sudo. Run: sudo npx clean-my-mac-cli maintenance --purgeable'
          : errorMessage,
      };
    }
  }
}


