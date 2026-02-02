import { spawn } from 'child_process';
import type { MaintenanceResult } from './dns-cache.js';

/**
 * Executes a command using spawn (safer than exec).
 */
function execCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
            timeout: 120000, // 2 minute timeout (tmutil can be slow)
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
 * Cleans up Time Machine local snapshots.
 */
export async function cleanTimeMachineSnapshots(): Promise<MaintenanceResult> {
    // Check if we're running as root
    const isRoot = process.getuid?.() === 0;

    try {
        const cmd = isRoot ? [] : ['sudo', '-n'];
        // thinlocalsnapshots reclaim space by removing older snapshots
        // We use a large number (100GB) to encourage maximum reclaiming
        const args = [...cmd, 'tmutil', 'thinlocalsnapshots', '/', '100000000000', '4'];

        await execCommand(args[0], args.slice(1));

        return {
            success: true,
            message: 'Time Machine local snapshots thinned successfully',
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const needsSudo = errorMessage.includes('Operation not permitted') ||
            errorMessage.includes('Permission denied') ||
            errorMessage.includes('sudo');

        return {
            success: false,
            message: 'Failed to clean Time Machine snapshots',
            error: needsSudo
                ? 'Requires sudo. Run: sudo mac-cleaner-cli maintenance --timemachine'
                : errorMessage,
            requiresSudo: needsSudo,
        };
    }
}
