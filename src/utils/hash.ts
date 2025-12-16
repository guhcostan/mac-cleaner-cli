import { createHash } from 'crypto';
import { createReadStream } from 'fs';

export async function getFileHash(filePath: string, algorithm = 'md5'): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    const stream = createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => {
      // Check stream is destroyed before rejecting
      if (!stream.destroyed) {
        stream.destroy();
      }
      reject(err);
    });
  });
}

/**
 * Computes hash of first N bytes of a file for quick duplicate detection.
 * For fast comparisons when full file hashing would be too slow.
 * Default samples first 1MB.
 */
export async function getFileHashPartial(
  filePath: string,
  bytes = 1024 * 1024,
  algorithm = 'md5'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    const stream = createReadStream(filePath, { start: 0, end: bytes - 1 });

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => {
      if (!stream.destroyed) {
        stream.destroy();
      }
      reject(err);
    });
  });
}







