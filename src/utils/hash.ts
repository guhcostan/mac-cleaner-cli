import { createHash } from 'crypto';
import { createReadStream } from 'fs';

export async function getFileHash(filePath: string, algorithm = 'md5'): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    const stream = createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

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
    stream.on('error', reject);
  });
}




