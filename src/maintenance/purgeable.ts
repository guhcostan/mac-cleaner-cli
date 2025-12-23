import { spawn } from 'child_process';

export interface MaintenanceResult {
  success: boolean;
  message: string;
  error?: string;
  requiresSudo?: boolean;
}

/**
 * Executes a command using spawn (safer than exec).
 */
function execCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      timeout: 60000, // 60 second timeout (purge can take a while)
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Process exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

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
      await execCommand(purgePath, []);
      return {
        success: true,
        message: 'Purgeable space freed successfully',
      };
    }
    
    // Try with sudo -n first (non-interactive)
    await execCommand('sudo', ['-n', purgePath]);
    return {
      success: true,
      message: 'Purgeable space freed successfully',
    };
  } catch {
    // sudo -n failed, try without sudo (might work in some configurations)
    try {
      await execCommand(purgePath, []);
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


