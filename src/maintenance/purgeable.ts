import { execCommand } from '../utils/exec.js';
import type { MaintenanceResult } from './types.js';

// purge can take a while
const PURGE_TIMEOUT = 60_000;

/**
 * Frees purgeable disk space on macOS.
 * 
 * Security notes:
 * - Uses spawn instead of exec to prevent command injection
 * - Uses absolute path to purge binary
 * - Uses sudo -n (non-interactive) to avoid password prompts
 * - Provides clear feedback if sudo is required
 */
export async function freePurgeableSpace(): Promise<MaintenanceResult> {
  const purgePath = '/usr/sbin/purge';
  
  // Check if we're running as root
  const isRoot = process.getuid?.() === 0;
  
  try {
    if (isRoot) {
      // Running as root, execute directly
      await execCommand(purgePath, [], PURGE_TIMEOUT);
      return {
        success: true,
        message: 'Purgeable space freed successfully',
      };
    }
    
    // Try with sudo -n first (non-interactive)
    await execCommand('sudo', ['-n', purgePath], PURGE_TIMEOUT);
    return {
      success: true,
      message: 'Purgeable space freed successfully',
    };
  } catch {
    // sudo -n failed, try without sudo (might work in some configurations)
    try {
      await execCommand(purgePath, [], PURGE_TIMEOUT);
      return {
        success: true,
        message: 'Purgeable space freed successfully',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const needsSudo = errorMessage.includes('Operation not permitted') || 
                        errorMessage.includes('Permission denied');

      return {
        success: false,
        message: 'Failed to free purgeable space',
        error: needsSudo
          ? 'Requires sudo. Run: sudo mac-cleaner-cli maintenance --purgeable'
          : errorMessage,
        requiresSudo: needsSudo,
      };
    }
  }
}


