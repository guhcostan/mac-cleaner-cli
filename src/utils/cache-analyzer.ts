import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { PATHS } from './paths.js';
import { formatSize } from './size.js';

export interface CacheItem {
    name: string;
    path: string;
    size: number;
    formattedSize: string;
}

/**
 * Recursively calculates the size of a directory
 */
async function getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
        const entries = await readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dirPath, entry.name);

            try {
                if (entry.isDirectory()) {
                    totalSize += await getDirectorySize(fullPath);
                } else if (entry.isFile()) {
                    const stats = await stat(fullPath);
                    totalSize += stats.size;
                }
            } catch {
                // Skip files/folders we can't access
                continue;
            }
        }
    } catch {
        // Can't read directory
    }

    return totalSize;
}

/**
 * Analyzes all cache directories in ~/Library/Caches and returns sorted by size
 */
export async function analyzeCacheFolders(minSizeMB = 10): Promise<CacheItem[]> {
    const cacheDir = PATHS.userCaches;
    const cacheItems: CacheItem[] = [];

    try {
        const entries = await readdir(cacheDir, { withFileTypes: true });

        console.log(`\n🔍 Scanning ${entries.length} cache folders...\n`);

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = join(cacheDir, entry.name);

                try {
                    const size = await getDirectorySize(fullPath);
                    const minSizeBytes = minSizeMB * 1024 * 1024;

                    if (size >= minSizeBytes) {
                        cacheItems.push({
                            name: entry.name,
                            path: fullPath,
                            size,
                            formattedSize: formatSize(size),
                        });
                    }
                } catch {
                    // Skip folders we can't access
                    continue;
                }
            }
        }
    } catch (error) {
        console.error('Error analyzing cache folders:', error);
    }

    // Sort by size (largest first)
    return cacheItems.sort((a, b) => b.size - a.size);
}

/**
 * Prints a formatted report of cache analysis
 */
export function printCacheReport(items: CacheItem[]): void {
    console.log('📊 Cache Analysis Report');
    console.log('─'.repeat(80));
    console.log(`Found ${items.length} cache folders larger than 10 MB:\n`);

    let totalSize = 0;

    items.forEach((item, index) => {
        totalSize += item.size;
        console.log(`${(index + 1).toString().padStart(2)}. ${item.formattedSize.padStart(10)} - ${item.name}`);
    });

    console.log('─'.repeat(80));
    console.log(`Total cache size: ${formatSize(totalSize)}\n`);
}
