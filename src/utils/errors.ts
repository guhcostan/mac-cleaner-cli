/**
 * Error helpers used to make failures visible instead of silently swallowed.
 *
 * Many filesystem operations legitimately fail (missing paths, TCC/permission
 * denials) and must not abort a scan. Those failures are still reported through
 * `debugError`, which prints them only when debugging is enabled via
 * `MAC_CLEANER_DEBUG=1`, so users can diagnose "why was nothing found?".
 */

const EXPECTED_CODES = new Set(['ENOENT', 'EACCES', 'EPERM', 'ENOTDIR', 'ELOOP']);

export function isDebugEnabled(): boolean {
  const value = process.env.MAC_CLEANER_DEBUG;
  return value !== undefined && value !== '' && value !== '0' && value !== 'false';
}

/** Human readable message for any thrown value. */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code && !error.message.includes(code) ? `${code}: ${error.message}` : error.message;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return 'Unknown error';
}

/** Short errno-style code for an error, for aggregating failures. */
export function errorCode(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code || 'UNKNOWN';
}

/**
 * True for errors that are part of normal operation on macOS (a path that does
 * not exist, or one the process is not allowed to read).
 */
export function isExpectedFsError(error: unknown): boolean {
  return EXPECTED_CODES.has(errorCode(error));
}

/**
 * Records an error that is intentionally not propagated. Visible with
 * `MAC_CLEANER_DEBUG=1`; silent otherwise so normal output stays clean.
 */
export function debugError(context: string, error: unknown): void {
  if (!isDebugEnabled()) {
    return;
  }
  console.error(`[mac-cleaner-cli:debug] ${context}: ${formatError(error)}`);
  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
}
