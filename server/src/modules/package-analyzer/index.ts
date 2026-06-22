import type { RegistryType, PackageVersionMetadata, FileDiffEntry, CompareResult } from '../../types';
import type { PackageFileEntry } from './types';
import { listPackageFiles } from './archive';
import { extractNpmPackageJson, extractNpmMetadata } from './metadata-npm';
import { extractPypiPackageMetadata } from './metadata-pypi';
import { diffFileContent } from './diff';

export { diffFileContent } from './diff';
export type { PackageFileEntry } from './types';

export async function extractPackageMetadata(
  filePath: string,
  registry: RegistryType
): Promise<Partial<PackageVersionMetadata>> {
  try {
    if (registry === 'npm') {
      const pkgJson = await extractNpmPackageJson(filePath);
      return extractNpmMetadata(pkgJson);
    } else {
      return await extractPypiPackageMetadata(filePath);
    }
  } catch {
    return {};
  }
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

  const [filesA, filesB, extractedMetaA, extractedMetaB] = await Promise.all([
    listPackageFiles(filePathA, registry),
    listPackageFiles(filePathB, registry),
    extractPackageMetadata(filePathA, registry),
    extractPackageMetadata(filePathB, registry),
  ]);

  const mergedMetaA: PackageVersionMetadata = { ...metaA, ...extractedMetaA };
  const mergedMetaB: PackageVersionMetadata = { ...metaB, ...extractedMetaB };

  const fileCompare = compareFileLists(filesA, filesB);

  return {
    packageName,
    registry,
    versionA,
    versionB,
    metadataDiff: compareMetadata(mergedMetaA, mergedMetaB),
    sizeDiff: {
      sizeA,
      sizeB,
      sizeDelta,
      sizeDeltaPercent,
    },
    files: fileCompare,
    versionAInfo: mergedMetaA,
    versionBInfo: mergedMetaB,
  };
}
