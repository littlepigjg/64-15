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

function parseProjectUrls(raw: string): Array<{ label: string; url: string }> {
  const result: Array<{ label: string; url: string }> = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    const commaIdx = line.indexOf(',');
    if (commaIdx > 0) {
      const label = line.slice(0, commaIdx).trim();
      const url = line.slice(commaIdx + 1).trim();
      if (label && url) {
        result.push({ label, url });
      }
    }
  }
  return result;
}

function extractLicenseFromClassifiers(classifiers: string[]): string | null {
  const licenseCls = classifiers.filter((c) => c.startsWith('License :: '));
  if (licenseCls.length === 0) return null;

  const specific = licenseCls.filter(
    (c) => !c.includes(' :: OSI Approved') && c !== 'License :: OSI Approved'
  );
  const target = specific.length > 0 ? specific[specific.length - 1] : licenseCls[licenseCls.length - 1];
  const parts = target.split(' :: ');
  return parts[parts.length - 1].trim();
}

function extractRepositoryUrl(urls: Array<{ label: string; url: string }>): string | null {
  const exactPriority = [
    'Repository',
    'Source',
    'Source Code',
    'Code',
    'GitHub',
    'GitLab',
    'Bitbucket',
    'Homepage',
  ];

  for (const label of exactPriority) {
    const found = urls.find((u) => u.label.toLowerCase() === label.toLowerCase());
    if (found) return found.url;
  }

  const fuzzyPriority = [
    /repository/i,
    /^source(\s|$)/i,
    /\bsource\s*code\b/i,
    /^github(\s|$)/i,
    /^gitlab(\s|$)/i,
    /^code(\s|$)/i,
  ];

  for (const pattern of fuzzyPriority) {
    const found = urls.find((u) => pattern.test(u.label));
    if (found) return found.url;
  }

  const githubUrl = urls.find((u) => /github\.com/i.test(u.url));
  if (githubUrl) return githubUrl.url;

  return null;
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

  if (data['Home-page']) metadata.homepage = data['Home-page'];

  const allUrls: Array<{ label: string; url: string }> = [];
  if (data['Home-page']) {
    allUrls.push({ label: 'Homepage', url: data['Home-page'] });
  }
  if (data['Project-URL']) {
    allUrls.push(...parseProjectUrls(data['Project-URL']));
  }

  if (allUrls.length > 0) {
    const repoUrl = extractRepositoryUrl(allUrls);
    if (repoUrl) metadata.repository = repoUrl;
  }

  if (data['Keywords']) {
    metadata.keywords = data['Keywords']
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
  }

  const classifiers = data['Classifier'] ? data['Classifier'].split('\n') : [];
  const classifierLicense = extractLicenseFromClassifiers(classifiers);
  if (classifierLicense) {
    metadata.license = classifierLicense;
  } else if (data['License']) {
    metadata.license = data['License'];
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
