import { diffLines } from 'diff';
import type { RegistryType, FileContentDiff, DiffLine } from '../../types';
import { readFileFromPackage, isBinaryContent, isTextFile } from './archive';

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
    readFileFromPackage(tarballPathA, registry, filePath),
    readFileFromPackage(tarballPathB, registry, filePath),
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
