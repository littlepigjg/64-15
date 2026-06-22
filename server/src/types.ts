export type RegistryType = 'npm' | 'pypi';

export type PackageSource = 'cache' | 'private' | 'upstream';

export interface PackageInfo {
  name: string;
  registry: RegistryType;
  source: PackageSource;
  versions: PackageVersion[];
  latestVersion: string;
  description?: string;
  author?: string;
  license?: string;
  scope?: string;
  createdAt: number;
  updatedAt: number;
  totalSize: number;
  downloadCount: number;
}

export interface PackageVersion {
  version: string;
  size: number;
  filePath: string;
  sha1?: string;
  publishedAt: number;
  downloadCount: number;
}

export interface CacheStats {
  totalPackages: number;
  totalVersions: number;
  totalSize: number;
  npmPackages: number;
  pypiPackages: number;
  privatePackages: number;
  cachePackages: number;
  maxSize: number;
  usagePercent: number;
}

export interface StorageTrend {
  date: string;
  size: number;
  packages: number;
}

export interface CachePolicy {
  maxSizeGB: number;
  maxAgeDays: number;
  autoClean: boolean;
}

export interface PackageVersionMetadata {
  version: string;
  description?: string;
  author?: string;
  license?: string;
  size: number;
  publishedAt: number;
  downloadCount: number;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  main?: string;
  module?: string;
  types?: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  bugs?: string;
}

export interface FileDiffEntry {
  path: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  sizeA?: number;
  sizeB?: number;
  sizeDiff?: number;
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineA?: number;
  lineB?: number;
}

export interface FileContentDiff {
  path: string;
  status: 'added' | 'removed' | 'modified' | 'binary' | 'unchanged' | 'error';
  contentA?: string;
  contentB?: string;
  lines?: DiffLine[];
  error?: string;
}

export interface CompareResult {
  packageName: string;
  registry: RegistryType;
  versionA: string;
  versionB: string;
  metadataDiff: {
    field: string;
    valueA?: string | number | string[] | Record<string, string>;
    valueB?: string | number | string[] | Record<string, string>;
    changed: boolean;
  }[];
  sizeDiff: {
    sizeA: number;
    sizeB: number;
    sizeDelta: number;
    sizeDeltaPercent: number;
  };
  files: {
    countA: number;
    countB: number;
    countDelta: number;
    diff: FileDiffEntry[];
  };
  versionAInfo?: PackageVersionMetadata;
  versionBInfo?: PackageVersionMetadata;
}
