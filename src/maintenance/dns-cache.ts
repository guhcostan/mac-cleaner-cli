import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface MaintenanceResult {
  success: boolean;
  message: string;
  error?: string;
}

export async function flushDnsCache(): Promise<MaintenanceResult> {
  try {
    await execAsync('sudo dscacheutil -flushcache');
    await execAsync('sudo killall -HUP mDNSResponder');

    return {
      success: true,
      message: 'DNS cache flushed successfully',
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to flush DNS cache',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}




