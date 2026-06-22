import fs from 'fs';
import tar from 'tar';
import zlib from 'zlib';
import { diffLines } from 'diff';
import type { RegistryType, PackageVersionMetadata, FileDiffEntry, CompareResult, FileContentDiff, DiffLine } from '../../types';

export interface PackageFileEntry {
  path: string;
  size: number;
}

function normalizeTarEntryPath(p: string): string {
  return p.replace(/^package\//, '');
}

async function listNpmTarball(tarballPath: string): Promise<PackageFileEntry[]> {
  const entries: PackageFileEntry[] = [];

  await new Promise<void>((resolve, reject) => {
    const gunzip = zlib.createGunzip();
    const extract = new tar.Parser();

    extract.on('entry', (entry: any) => {
      if (entry.type === 'File' || entry.type === 'file') {
        const normalizedPath = normalizeTarEntryPath(entry.path);
        entries.push({
          path: normalizedPath,
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

async function extractNpmPackageJson(tarballPath: string): Promise<any | null> {
  let pkgJson: any = null;

  await new Promise<void>((resolve, reject) => {
    const gunzip = zlib.createGunzip();
    const extract = new tar.Parser();

    extract.on('entry', (entry: any) => {
      const normalizedPath = normalizeTarEntryPath(entry.path);
      if (normalizedPath === 'package.json') {
        const chunks: Buffer[] = [];
        entry.on('data', (chunk: Buffer) => chunks.push(chunk));
        entry.on('end', () => {
          try {
            pkgJson = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          } catch {
            pkgJson = null;
          }
          resolve();
        });
        entry.on('error', reject);
      } else {
        entry.resume();
      }
    });

    extract.on('end', () => resolve());
    extract.on('error', reject);
    gunzip.on('error', reject);

    fs.createReadStream(tarballPath).pipe(gunzip).pipe(extract);
  });

  return pkgJson;
}

function extractNpmMetadata(pkgJson: any): Partial<PackageVersionMetadata> {
  if (!pkgJson) return {};

  const metadata: Partial<PackageVersionMetadata> = {};

  if (typeof pkgJson.description === 'string') metadata.description = pkgJson.description;

  if (pkgJson.author) {
    if (typeof pkgJson.author === 'string') {
      metadata.author = pkgJson.author;
    } else if (typeof pkgJson.author === 'object') {
      const parts: string[] = [];
      if (pkgJson.author.name) parts.push(pkgJson.author.name);
      if (pkgJson.author.email) parts.push(`<${pkgJson.author.email}>`);
      if (pkgJson.author.url) parts.push(`(${pkgJson.author.url})`);
      if (parts.length) metadata.author = parts.join(' ');
    }
  }

  if (typeof pkgJson.license === 'string') metadata.license = pkgJson.license;

  if (pkgJson.dependencies && typeof pkgJson.dependencies === 'object') {
    metadata.dependencies = pkgJson.dependencies;
  }
  if (pkgJson.peerDependencies && typeof pkgJson.peerDependencies === 'object') {
    metadata.peerDependencies = pkgJson.peerDependencies;
  }
  if (pkgJson.optionalDependencies && typeof pkgJson.optionalDependencies === 'object') {
    metadata.optionalDependencies = pkgJson.optionalDependencies;
  }
  if (pkgJson.devDependencies && typeof pkgJson.devDependencies === 'object') {
    metadata.devDependencies = pkgJson.devDependencies;
  }
  if (pkgJson.engines && typeof pkgJson.engines === 'object') {
    metadata.engines = pkgJson.engines;
  }

  if (typeof pkgJson.main === 'string') metadata.main = pkgJson.main;
  if (typeof pkgJson.module === 'string') metadata.module = pkgJson.module;
  if (typeof pkgJson.types === 'string') metadata.types = pkgJson.types;
  else if (typeof pkgJson.typings === 'string') metadata.types = pkgJson.typings;

  if (typeof pkgJson.homepage === 'string') metadata.homepage = pkgJson.homepage;

  if (pkgJson.repository) {
    if (typeof pkgJson.repository === 'string') {
      metadata.repository = pkgJson.repository;
    } else if (typeof pkgJson.repository === 'object' && typeof pkgJson.repository.url === 'string') {
      metadata.repository = pkgJson.repository.url;
    }
  }

  if (Array.isArray(pkgJson.keywords)) {
    metadata.keywords = pkgJson.keywords.filter((k: any) => typeof k === 'string');
  }

  if (pkgJson.bugs) {
    if (typeof pkgJson.bugs === 'string') {
      metadata.bugs = pkgJson.bugs;
    } else if (typeof pkgJson.bugs === 'object' && typeof pkgJson.bugs.url === 'string') {
      metadata.bugs = pkgJson.bugs.url;
    }
  }

  return metadata;
}

function isZipFile(filePath: string): boolean {
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

function listZipContents(zipPath: string): PackageFileEntry[] {
  const entries: PackageFileEntry[] = [];
  try {
    const buf = fs.readFileSync(zipPath);
    let offset = 0;
    const MAX_ENTRIES = 10000;
    let entryCount = 0;

    while (offset < buf.length - 4 && entryCount < MAX_ENTRIES) {
      const sig = buf.readUInt32LE(offset);
      if (sig !== 0x04034b50) break;

      const compSize = buf.readUInt32LE(offset + 18);
      const uncompSize = buf.readUInt32LE(offset + 22);
      const nameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);

      const name = buf.toString('utf8', offset + 30, offset + 30 + nameLen);

      if (!name.endsWith('/')) {
        entries.push({
          path: name,
          size: uncompSize || compSize,
        });
      }

      offset += 30 + nameLen + extraLen + compSize;
      entryCount++;
    }
  } catch {
    // fall through and return empty or partial results
  }
  return entries;
}

async function listPypiPackage(filePath: string): Promise<PackageFileEntry[]> {
  if (isZipFile(filePath)) {
    return listZipContents(filePath);
  }
  try {
    return await listNpmTarball(filePath);
  } catch {
    return [];
  }
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
      return await listNpmTarball(filePath);
    } else {
      return await listPypiPackage(filePath);
    }
  } catch {
    return [];
  }
}

export async function extractPackageMetadata(
  filePath: string,
  registry: RegistryType
): Promise<Partial<PackageVersionMetadata>> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    if (registry === 'npm') {
      const pkgJson = await extractNpmPackageJson(filePath);
      return extractNpmMetadata(pkgJson);
    }
  } catch {
    // fall through
  }
  return {};
}

function compareFileLists(
  filesA: PackageFileEntry[],
  filesB: PackageFileEntry[]
): { diff: FileDiffEntry[]; countA: number; countB: number; countDelta: number } {
  const mapA = new Map(filesA.map((f) => [f.path, f]));
  const mapB = new Map(filesB.map((f) => [f.path, f]));

  const allPaths = new Set([...mapA.keys(), ...mapB.keys()]);
  const diff: FileDiffEntry[] = [];

  for (const p of allPaths) {
    const a = mapA.get(p);
    const b = mapB.get(p);

    if (a && !b) {
      diff.push({ path: p, status: 'removed', sizeA: a.size, sizeDiff: -a.size });
    } else if (!a && b) {
      diff.push({ path: p, status: 'added', sizeB: b.size, sizeDiff: b.size });
    } else if (a && b) {
      if (a.size !== b.size) {
        diff.push({
          path: p,
          status: 'modified',
          sizeA: a.size,
          sizeB: b.size,
          sizeDiff: b.size - a.size,
        });
      } else {
        diff.push({ path: p, status: 'unchanged', sizeA: a.size, sizeB: b.size, sizeDiff: 0 });
      }
    }
  }

  diff.sort((a, b) => a.path.localeCompare(b.path));

  return {
    diff,
    countA: filesA.length,
    countB: filesB.length,
    countDelta: filesB.length - filesA.length,
  };
}

const METADATA_FIELDS: Array<{
  key: keyof PackageVersionMetadata;
  label: string;
  compare?: (a: any, b: any) => boolean;
}> = [
  { key: 'version', label: '版本号' },
  { key: 'description', label: '描述' },
  { key: 'author', label: '作者' },
  { key: 'license', label: '许可证' },
  { key: 'main', label: '入口文件 (main)' },
  { key: 'module', label: 'ESM 入口 (module)' },
  { key: 'types', label: '类型定义 (types)' },
  { key: 'homepage', label: '主页' },
  { key: 'repository', label: '代码仓库' },
  { key: 'bugs', label: '问题反馈' },
  { key: 'keywords', label: '关键词', compare: (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []) },
  { key: 'engines', label: '引擎要求', compare: (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {}) },
  { key: 'dependencies', label: '运行依赖', compare: (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {}) },
  { key: 'peerDependencies', label: 'peer 依赖', compare: (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {}) },
  { key: 'optionalDependencies', label: '可选依赖', compare: (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {}) },
  { key: 'devDependencies', label: '开发依赖', compare: (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {}) },
];

function isDefined(v: any): boolean {
  return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
}

function compareMetadata(
  metaA: PackageVersionMetadata,
  metaB: PackageVersionMetadata
): CompareResult['metadataDiff'] {
  const result: CompareResult['metadataDiff'] = [];

  for (const field of METADATA_FIELDS) {
    const valueA = metaA[field.key];
    const valueB = metaB[field.key];
    const hasA = isDefined(valueA);
    const hasB = isDefined(valueB);

    if (!hasA && !hasB) continue;

    let changed: boolean;
    if (field.compare) {
      changed = !field.compare(valueA, valueB);
    } else {
      changed = (valueA as any) !== (valueB as any);
    }

    result.push({
      field: field.label,
      valueA: hasA ? (valueA as any) : undefined,
      valueB: hasB ? (valueB as any) : undefined,
      changed,
    });
  }

  return result;
}

export async function comparePackageVersions(
  packageName: string,
  registry: RegistryType,
  versionA: string,
  versionB: string,
  metaA: PackageVersionMetadata,
  metaB: PackageVersionMetadata,
  filePathA: string,
  filePathB: string
): Promise<CompareResult> {
  const sizeA = metaA.size || 0;
  const sizeB = metaB.size || 0;
  const sizeDelta = sizeB - sizeA;
  const sizeDeltaPercent = sizeA > 0 ? (sizeDelta / sizeA) * 100 : 0;

  const [filesA, filesB] = await Promise.all([
    listPackageFiles(filePathA, registry),
    listPackageFiles(filePathB, registry),
  ]);

  const fileCompare = compareFileLists(filesA, filesB);

  return {
    packageName,
    registry,
    versionA,
    versionB,
    metadataDiff: compareMetadata(metaA, metaB),
    sizeDiff: {
      sizeA,
      sizeB,
      sizeDelta,
      sizeDeltaPercent,
    },
    files: fileCompare,
    versionAInfo: metaA,
    versionBInfo: metaB,
  };
}

function isBinaryContent(content: Buffer): boolean {
  const maxCheckBytes = Math.min(content.length, 8000);
  for (let i = 0; i < maxCheckBytes; i++) {
    const byte = content[i];
    if (byte === 0) return true;
  }
  return false;
}

function readFileFromTar(tarballPath: string, filePath: string): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const gunzip = zlib.createGunzip();
    const extract = new tar.Parser();
    let found = false;

    extract.on('entry', (entry: any) => {
      const normalizedPath = normalizeTarEntryPath(entry.path);
      if (normalizedPath === filePath) {
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

function readFileFromZip(zipPath: string, filePath: string): Buffer | null {
  try {
    const buf = fs.readFileSync(zipPath);
    let offset = 0;
    const MAX_ENTRIES = 10000;
    let entryCount = 0;

    while (offset < buf.length - 4 && entryCount < MAX_ENTRIES) {
      const sig = buf.readUInt32LE(offset);
      if (sig !== 0x04034b50) break;

      const compSize = buf.readUInt32LE(offset + 18);
      const uncompSize = buf.readUInt32LE(offset + 22);
      const nameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const compression = buf.readUInt16LE(offset + 8);

      const name = buf.toString('utf8', offset + 30, offset + 30 + nameLen);

      if (name === filePath && compression === 0 && compSize === uncompSize) {
        const dataOffset = offset + 30 + nameLen + extraLen;
        return buf.slice(dataOffset, dataOffset + uncompSize);
      }

      offset += 30 + nameLen + extraLen + compSize;
      entryCount++;
    }
  } catch {
    return null;
  }
  return null;
}

async function extractFileContent(
  filePath: string,
  registry: RegistryType,
  targetPath: string
): Promise<Buffer | null> {
  if (!fs.existsSync(filePath)) return null;

  try {
    if (registry === 'npm') {
      return await readFileFromTar(filePath, targetPath);
    } else {
      if (isZipFile(filePath)) {
        return readFileFromZip(filePath, targetPath);
      }
      return await readFileFromTar(filePath, targetPath);
    }
  } catch {
    return null;
  }
}

function convertToDiffLines(
  changes: Array<{ count?: number; value: string; added?: boolean; removed?: boolean }>
): DiffLine[] {
  const lines: DiffLine[] = [];
  let lineA = 1;
  let lineB = 1;

  for (const change of changes) {
    const contentLines = change.value.split('\n');
    if (contentLines[contentLines.length - 1] === '') {
      contentLines.pop();
    }

    for (const line of contentLines) {
      if (change.added) {
        lines.push({ type: 'added', content: line, lineB });
        lineB++;
      } else if (change.removed) {
        lines.push({ type: 'removed', content: line, lineA });
        lineA++;
      } else {
        lines.push({ type: 'unchanged', content: line, lineA, lineB });
        lineA++;
        lineB++;
      }
    }
  }

  return lines;
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

function isTextFile(path: string): boolean {
  const ext = '.' + path.split('.').pop()?.toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (path.endsWith('/')) return false;
  const basename = path.split('/').pop()?.toLowerCase() || '';
  if (['readme', 'changelog', 'license', 'makefile', 'dockerfile'].includes(basename)) return true;
  return false;
}

export async function diffFileContent(
  registry: RegistryType,
  versionA: string,
  versionB: string,
  filePath: string,
  tarballPathA: string,
  tarballPathB: string
): Promise<FileContentDiff> {
  const isText = isTextFile(filePath);

  const [bufA, bufB] = await Promise.all([
    extractFileContent(tarballPathA, registry, filePath),
    extractFileContent(tarballPathB, registry, filePath),
  ]);

  const hasA = bufA !== null;
  const hasB = bufB !== null;

  if (!hasA && !hasB) {
    return { path: filePath, status: 'error', error: 'File not found in either version' };
  }

  if (!hasB) {
    if (!isText || (bufA && isBinaryContent(bufA))) {
      return { path: filePath, status: 'removed' };
    }
    const contentA = bufA!.toString('utf-8');
    return {
      path: filePath,
      status: 'removed',
      contentA,
      lines: convertToDiffLines([{ value: contentA, removed: true }]),
    };
  }

  if (!hasA) {
    if (!isText || (bufB && isBinaryContent(bufB))) {
      return { path: filePath, status: 'added' };
    }
    const contentB = bufB!.toString('utf-8');
    return {
      path: filePath,
      status: 'added',
      contentB,
      lines: convertToDiffLines([{ value: contentB, added: true }]),
    };
  }

  if (!isText || isBinaryContent(bufA) || isBinaryContent(bufB)) {
    return { path: filePath, status: 'binary' };
  }

  const contentA = bufA.toString('utf-8');
  const contentB = bufB.toString('utf-8');

  if (contentA === contentB) {
    return { path: filePath, status: 'unchanged', contentA, contentB };
  }

  const changes = diffLines(contentA, contentB, { ignoreWhitespace: false, newlineIsToken: false });

  return {
    path: filePath,
    status: 'modified',
    contentA,
    contentB,
    lines: convertToDiffLines(changes),
  };
}
