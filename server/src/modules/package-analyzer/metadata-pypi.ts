import type { PackageVersionMetadata } from '../../types';
import { isZipFile, readFileFromZipByName, readFileFromTar, normalizeTarEntryPathPypi, listTarFiles } from './archive';

function parsePkginfo(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');
  let currentKey: string | null = null;

  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (currentKey) {
        result[currentKey] += '\n' + line.trim();
      }
    } else if (line.includes(':')) {
      const colonIndex = line.indexOf(':');
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      if (key) {
        if (result[key]) {
          result[key] += '\n' + value;
        } else {
          result[key] = value;
        }
        currentKey = key;
      }
    }
  }

  return result;
}

function extractPypiMetadataFromPkginfo(data: Record<string, string>): Partial<PackageVersionMetadata> {
  const metadata: Partial<PackageVersionMetadata> = {};

  if (data['Summary']) metadata.description = data['Summary'];
  else if (data['Description']) metadata.description = data['Description'];

  if (data['Author']) {
    let author = data['Author'];
    if (data['Author-email']) {
      author += ` <${data['Author-email']}>`;
    }
    metadata.author = author;
  } else if (data['Maintainer']) {
    let maintainer = data['Maintainer'];
    if (data['Maintainer-email']) {
      maintainer += ` <${data['Maintainer-email']}>`;
    }
    metadata.author = maintainer;
  }

  if (data['License']) metadata.license = data['License'];

  if (data['Home-page']) metadata.homepage = data['Home-page'];

  if (data['Project-URL']) {
    const urls = data['Project-URL'].split('\n');
    for (const url of urls) {
      if (url.toLowerCase().includes('repository') || url.toLowerCase().includes('github') || url.toLowerCase().includes('source')) {
        const parts = url.split(',');
        if (parts.length >= 2) {
          metadata.repository = parts.slice(1).join(',').trim();
          break;
        }
      }
    }
  }

  if (data['Keywords']) {
    metadata.keywords = data['Keywords'].split(/[, ]+/).filter(Boolean);
  }

  if (data['Classifier']) {
    const classifiers = data['Classifier'].split('\n');
    for (const cls of classifiers) {
      if (cls.startsWith('License :: ')) {
        const parts = cls.split(' :: ');
        if (!metadata.license) {
          metadata.license = parts[parts.length - 1].trim();
        }
      }
    }
  }

  if (data['Requires-Dist']) {
    const deps: Record<string, string> = {};
    const depsList = data['Requires-Dist'].split('\n');
    for (const dep of depsList) {
      const nameMatch = dep.match(/^([A-Za-z0-9_.-]+)/);
      const verMatch = dep.match(/[>=<~!]=?\s*([^;\s]+)/);
      if (nameMatch) {
        deps[nameMatch[1]] = verMatch ? verMatch[0] : '*';
      }
    }
    metadata.dependencies = deps;
  }

  if (data['Requires-Python']) {
    metadata.engines = { python: data['Requires-Python'] };
  }

  return metadata;
}

export async function extractPypiPackageMetadata(
  filePath: string
): Promise<Partial<PackageVersionMetadata>> {
  if (isZipFile(filePath)) {
    let buf = readFileFromZipByName(filePath, (name) => {
      return name.endsWith('.dist-info/METADATA') || name.endsWith('.egg-info/PKG-INFO');
    });

    if (!buf) {
      buf = readFileFromZipByName(filePath, (name) => {
        const basename = name.split('/').pop();
        return basename === 'PKG-INFO' || basename === 'METADATA';
      });
    }

    if (buf) {
      try {
        const content = buf.toString('utf-8');
        const pkginfo = parsePkginfo(content);
        return extractPypiMetadataFromPkginfo(pkginfo);
      } catch {
        return {};
      }
    }
    return {};
  }

  try {
    const entries = await listTarFiles(filePath);
    let targetPath: string | null = null;

    for (const entry of entries) {
      const basename = entry.path.split('/').pop();
      if (basename === 'PKG-INFO' || basename === 'METADATA') {
        targetPath = entry.path;
        break;
      }
    }

    if (!targetPath) {
      for (const entry of entries) {
        if (entry.path.endsWith('.egg-info/PKG-INFO') || entry.path.endsWith('.dist-info/METADATA')) {
          targetPath = entry.path;
          break;
        }
      }
    }

    if (targetPath) {
      const buf = await readFileFromTar(filePath, targetPath);
      if (buf) {
        try {
          const content = buf.toString('utf-8');
          const pkginfo = parsePkginfo(content);
          return extractPypiMetadataFromPkginfo(pkginfo);
        } catch {
          return {};
        }
      }
    }
  } catch {
    return {};
  }

  return {};
}
