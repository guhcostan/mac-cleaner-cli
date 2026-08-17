import { execCommand } from '../utils/exec.js';
import type { MaintenanceResult } from './types.js';

const DNS_TIMEOUT = 10_000;

/**
 * Checks if we can run sudo without a password (non-interactive).
 */
async function canSudoWithoutPassword(): Promise<boolean> {
  try {
    await execCommand('sudo', ['-n', 'true'], DNS_TIMEOUT);
    return true;
  } catch {
    return false;
  }
}

/**
 * Flushes the DNS cache on macOS.
 * 
 * Security notes:
 * - Uses spawn instead of exec to prevent command injection
 * - Uses sudo -n (non-interactive) to avoid password prompts
 * - Provides clear feedback if sudo is required
 */
export async function flushDnsCache(): Promise<MaintenanceResult> {
  // Check if we're running as root
  const isRoot = process.getuid?.() === 0;
  
  if (!isRoot) {
    // Check if we can sudo without password
    const canSudo = await canSudoWithoutPassword();
    
    if (!canSudo) {
      return {
        success: false,
        message: 'DNS cache flush requires administrator privileges',
        error: 'Run with sudo: sudo mac-cleaner-cli maintenance --dns',
        requiresSudo: true,
      };
    }
  }

  try {
    if (isRoot) {
      // Running as root, execute directly
      await execCommand('/usr/bin/dscacheutil', ['-flushcache'], DNS_TIMEOUT);
      await execCommand('/usr/bin/killall', ['-HUP', 'mDNSResponder'], DNS_TIMEOUT);
    } else {
      // Use sudo -n (non-interactive)
      await execCommand('sudo', ['-n', '/usr/bin/dscacheutil', '-flushcache'], DNS_TIMEOUT);
      await execCommand('sudo', ['-n', '/usr/bin/killall', '-HUP', 'mDNSResponder'], DNS_TIMEOUT);
    }

    return {
      success: true,
      message: 'DNS cache flushed successfully',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return {
      success: false,
      message: 'Failed to flush DNS cache',
      error: errorMessage.includes('Operation not permitted') || errorMessage.includes('sudo')
        ? 'Run with sudo: sudo mac-cleaner-cli maintenance --dns'
        : errorMessage,
      requiresSudo: errorMessage.includes('Operation not permitted'),
    };
  }
}







