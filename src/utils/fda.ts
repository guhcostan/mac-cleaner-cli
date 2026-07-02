import { readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Directory protected by macOS TCC — readable only when the terminal
 * has been granted Full Disk Access.
 */
const TCC_PROTECTED_PATH = join(homedir(), 'Library', 'Safari');

/**
 * Detects whether the current process has Full Disk Access.
 *
 * Works by probing a TCC-protected directory: macOS returns EPERM
 * for reads without Full Disk Access, even for the owning user.
 *
 * Returns:
 * - true: Full Disk Access is granted
 * - false: Full Disk Access is NOT granted
 * - null: unknown (not macOS, or the probe path doesn't exist)
 */
export async function hasFullDiskAccess(): Promise<boolean | null> {
  if (process.platform !== 'darwin') {
    return null;
  }

  try {
    await readdir(TCC_PROTECTED_PATH);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES') {
      return false;
    }
    return null;
  }
}

export const FULL_DISK_ACCESS_HINT =
  'Tip: your terminal does not have Full Disk Access, so some files cannot be scanned or removed.\n' +
  '     Grant it in System Settings → Privacy & Security → Full Disk Access, then restart your terminal.';
