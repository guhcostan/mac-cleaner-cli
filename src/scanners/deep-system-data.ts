import { BaseScanner } from './base-scanner.js';
import { CATEGORIES, type ScanResult, type ScannerOptions, type CleanableItem, type CleanResult } from '../types.js';
import { exists, getSize, removeItem } from '../utils/index.js';
import { stat, readdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

interface LargeFolderCandidate {
    name: string;
    path: string;
    minSizeMB: number;
}

/**
 * Scanner for deep system data that often accumulates in macOS.
 * This includes large Application Support folders, Containers, and Group Containers.
 */
export class DeepSystemDataScanner extends BaseScanner {
    category = CATEGORIES['deep-system-data'];

    private async scanDirectory(basePath: string, minSizeBytes: number): Promise<CleanableItem[]> {
        const items: CleanableItem[] = [];

        try {
            const entries = await readdir(basePath, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const fullPath = join(basePath, entry.name);

                    try {
                        const size = await getSize(fullPath);
                        if (size >= minSizeBytes) {
                            const stats = await stat(fullPath);
                            items.push({
                                path: fullPath,
                                size,
                                name: entry.name,
                                isDirectory: true,
                                modifiedAt: stats.mtime,
                            });
                        }
                    } catch {
                        // Skip folders we can't access
                        continue;
                    }
                }
            }
        } catch {
            // Can't read directory
        }

        return items;
    }

    async scan(options?: ScannerOptions): Promise<ScanResult> {
        const items: CleanableItem[] = [];
        const HOME = homedir();
        const minSizeBytes = (options?.minSize || 500) * 1024 * 1024; // Default 500 MB

        const scanTargets: LargeFolderCandidate[] = [
            {
                name: 'Application Support',
                path: join(HOME, 'Library', 'Application Support'),
                minSizeMB: 500,
            },
            {
                name: 'Containers',
                path: join(HOME, 'Library', 'Containers'),
                minSizeMB: 500,
            },
            {
                name: 'Group Containers',
                path: join(HOME, 'Library', 'Group Containers'),
                minSizeMB: 100,
            },
        ];

        for (const target of scanTargets) {
            if (await exists(target.path)) {
                const targetMinSize = (target.minSizeMB) * 1024 * 1024;
                const foundItems = await this.scanDirectory(target.path, targetMinSize);

                // Add category prefix to name for clarity
                for (const item of foundItems) {
                    items.push({
                        ...item,
                        name: `[${target.name}] ${item.name}`,
                    });
                }
            }
        }

        return this.createResult(items);
    }

    /**
     * Clean method with sudo support for protected directories
     */
    async clean(items: CleanableItem[], dryRun = false): Promise<CleanResult> {
        if (dryRun) {
            return {
                category: this.category,
                cleanedItems: items.length,
                freedSpace: items.reduce((sum, item) => sum + item.size, 0),
                errors: [],
            };
        }

        const errors: string[] = [];
        let freedSpace = 0;
        let cleanedCount = 0;

        // Check if we're running with sudo
        const isSudo = process.getuid?.() === 0;

        for (const item of items) {
            try {
                // Try normal deletion first
                await removeItem(item.path);

                freedSpace += item.size;
                cleanedCount++;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);

                // If permission denied and not running as sudo, try with sudo
                if (errorMessage.includes('EACCES') || errorMessage.includes('Operation not permitted')) {
                    if (!isSudo) {
                        errors.push(`${item.name}: Requires sudo. Run: sudo mac-cleaner-cli`);
                    } else {
                        errors.push(`${item.name}: ${errorMessage}`);
                    }
                } else {
                    errors.push(`${item.name}: ${errorMessage}`);
                }
            }
        }

        return {
            category: this.category,
            cleanedItems: cleanedCount,
            freedSpace,
            errors,
        };
    }
}
