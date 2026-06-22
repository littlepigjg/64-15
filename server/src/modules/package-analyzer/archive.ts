import fs from 'fs';
import tar from 'tar';
import zlib from 'zlib';
import type { PackageFileEntry } from './types';
import type { RegistryType } from '../../types';

export function normalizeTarEntryPath(p: string): string {
  return p.replace(/^package\//, '');
}

export function normalizeTarEntryPathPypi(p: string): string {
  return p.replace(/^[^/]+\//, '');
}

export function isZipFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf[0] === 0x50 && buf[1] === 0x4b;
  } catch {
    return false;
  }
}

export function isGzippedFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(2);
    fs.readSync(fd, buf, 0, 2, 0);
    fs.closeSync(fd);
    return buf[0] === 0x1f && buf[1] === 0x8b;
  } catch {
    return false;
  }
}

export async function listTarFiles(
  tarballPath: string,
  normalize?: (p: string) => string
): Promise<PackageFileEntry[]> {
  const entries: PackageFileEntry[] = [];

  await new Promise<void>((resolve, reject) => {
    const gunzip = zlib.createGunzip();
    const extract = new tar.Parser();

    extract.on('entry', (entry: any) => {
      if (entry.type === 'File' || entry.type === 'file') {
        const path = normalize ? normalize(entry.path) : entry.path;
        entries.push({
          path,
          size: entry.size || 0,
        });
      }
      entry.resume();
    });

    extract.on('end', () => resolve());
    extract.on('error', reject);
    gunzip.on('error', reject);

    fs.createReadStream(tarballPath).pipe(gunzip).pipe(extract);
  });

  return entries;
}

export async function readFileFromTar(
  tarballPath: string,
  targetPath: string,
  normalize?: (p: string) => string
): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const gunzip = zlib.createGunzip();
    const extract = new tar.Parser();
    let found = false;

    extract.on('entry', (entry: any) => {
      const normalizedPath = normalize ? normalize(entry.path) : entry.path;
      if (normalizedPath === targetPath || entry.path === targetPath) {
        found = true;
        const chunks: Buffer[] = [];
        entry.on('data', (chunk: Buffer) => chunks.push(chunk));
        entry.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
        entry.on('error', reject);
      } else {
        entry.resume();
      }
    });

    extract.on('end', () => {
      if (!found) resolve(null);
    });
    extract.on('error', reject);
    gunzip.on('error', reject);

    fs.createReadStream(tarballPath).pipe(gunzip).pipe(extract);
  });
}

interface ZipLocalFileEntry {
  name: string;
  compression: number;
  compSize: number;
  uncompSize: number;
  dataOffset: number;
}

export function parseZipEntries(buf: Buffer): ZipLocalFileEntry[] {
  const entries: ZipLocalFileEntry[] = [];
  let offset = 0;
  const MAX_ENTRIES = 10000;
  let entryCount = 0;

  while (offset < buf.length - 4 && entryCount < MAX_ENTRIES) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;

    const compression = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const uncompSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);

    const name = buf.toString('utf8', offset + 30, offset + 30 + nameLen);
    const dataOffset = offset + 30 + nameLen + extraLen;

    entries.push({ name, compression, compSize, uncompSize, dataOffset });

    offset = dataOffset + compSize;
    entryCount++;
  }

  return entries;
}

export function listZipContents(zipPath: string): PackageFileEntry[] {
  const entries: PackageFileEntry[] = [];
  try {
    const buf = fs.readFileSync(zipPath);
    for (const e of parseZipEntries(buf)) {
      if (!e.name.endsWith('/')) {
        entries.push({
          path: e.name,
          size: e.uncompSize || e.compSize,
        });
      }
    }
  } catch {
    // fall through and return empty or partial results
  }
  return entries;
}

export function readFileFromZip(zipPath: string, filePath: string): Buffer | null {
  try {
    const buf = fs.readFileSync(zipPath);
    for (const e of parseZipEntries(buf)) {
      if (e.name === filePath && e.compression === 0 && e.compSize === e.uncompSize) {
        return buf.slice(e.dataOffset, e.dataOffset + e.uncompSize);
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function readFileFromZipByName(
  zipPath: string,
  nameMatcher: (name: string) => boolean
): Buffer | null {
  try {
    const buf = fs.readFileSync(zipPath);
    for (const e of parseZipEntries(buf)) {
      if (nameMatcher(e.name) && e.compression === 0 && e.compSize === e.uncompSize) {
        return buf.slice(e.dataOffset, e.dataOffset + e.uncompSize);
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function listPackageFiles(
  filePath: string,
  registry: RegistryType
): Promise<PackageFileEntry[]> {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    if (registry === 'npm') {
      return await listTarFiles(filePath, normalizeTarEntryPath);
    } else {
      if (isZipFile(filePath)) {
        return listZipContents(filePath);
      }
      return await listTarFiles(filePath, normalizeTarEntryPathPypi);
    }
  } catch {
    return [];
  }
}

export async function readFileFromPackage(
  filePath: string,
  registry: RegistryType,
  targetPath: string
): Promise<Buffer | null> {
  if (!fs.existsSync(filePath)) return null;

  try {
    if (registry === 'npm') {
      return await readFileFromTar(filePath, targetPath, normalizeTarEntryPath);
    } else {
      if (isZipFile(filePath)) {
        return readFileFromZip(filePath, targetPath);
      }
      return await readFileFromTar(filePath, targetPath, normalizeTarEntryPathPypi);
    }
  } catch {
    return null;
  }
}

export function isBinaryContent(content: Buffer): boolean {
  const maxCheckBytes = Math.min(content.length, 8000);
  for (let i = 0; i < maxCheckBytes; i++) {
    const byte = content[i];
    if (byte === 0) return true;
  }
  return false;
}

const TEXT_EXTENSIONS = new Set([
  '.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.json', '.md', '.txt', '.html', '.css',
  '.scss', '.sass', '.less', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.sh', '.bash', '.zsh', '.py', '.pyc', '.pyx', '.pxd', '.pxi', '.rb', '.go', '.rs',
  '.java', '.kt', '.kts', '.swift', '.c', '.h', '.cpp', '.hpp', '.cc', '.hh', '.cs',
  '.fs', '.fsx', '.fsi', '.sql', '.graphql', '.gql', '.prisma', '.proto', '.vim', '.lua',
  '.pl', '.pm', '.t', '.r', '.R', '.m', '.mm', '.swift', '.dart', '.ex', '.exs', '.erl',
  '.hrl', '.clj', '.cljs', '.edn', '.coffee', '.litcoffee', '.vue', '.svelte', '.astro',
  '.prettierrc', '.eslintrc', '.gitignore', '.npmignore', '.dockerignore', '.env',
  '.editorconfig', '.gitattributes', '.gitmodules',
]);

export function isTextFile(path: string): boolean {
  const ext = '.' + path.split('.').pop()?.toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (path.endsWith('/')) return false;
  const basename = path.split('/').pop()?.toLowerCase() || '';
  if (['readme', 'changelog', 'license', 'makefile', 'dockerfile', 'pkg-info', 'metadata'].includes(basename)) return true;
  return false;
}
