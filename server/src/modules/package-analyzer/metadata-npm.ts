import type { PackageVersionMetadata } from '../../types';
import { readFileFromTar, normalizeTarEntryPath } from './archive';

export async function extractNpmPackageJson(tarballPath: string): Promise<any | null> {
  try {
    const buf = await readFileFromTar(tarballPath, 'package.json', normalizeTarEntryPath);
    if (!buf) return null;
    try {
      return JSON.parse(buf.toString('utf-8'));
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

export function extractNpmMetadata(pkgJson: any): Partial<PackageVersionMetadata> {
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
