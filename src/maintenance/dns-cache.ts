import { spawn } from 'child_process';

export interface MaintenanceResult {
  success: boolean;
  message: string;
  error?: string;
  requiresSudo?: boolean;
}

/**
 * Executes a command using spawn (safer than exec).
 * Returns a promise that resolves with stdout or rejects with error.
 */
function execCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      timeout: 10000, // 10 second timeout
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
 * Checks if we can run sudo without a password (non-interactive).
 */
async function canSudoWithoutPassword(): Promise<boolean> {
  try {
    await execCommand('sudo', ['-n', 'true']);
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
      await execCommand('/usr/bin/dscacheutil', ['-flushcache']);
      await execCommand('/usr/bin/killall', ['-HUP', 'mDNSResponder']);
    } else {
      // Use sudo -n (non-interactive)
      await execCommand('sudo', ['-n', '/usr/bin/dscacheutil', '-flushcache']);
      await execCommand('sudo', ['-n', '/usr/bin/killall', '-HUP', 'mDNSResponder']);
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







