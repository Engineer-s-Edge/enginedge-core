import * as path from 'path';

export interface CallSite {
  source?: string;
  sourceAbs?: string;
  file?: string;
  line?: number;
  column?: number;
  function?: string;
}

export function computeCallSite(skipUntil?: Function, hint?: string): CallSite {
  const err = new Error();
  if ((Error as any).captureStackTrace && skipUntil) {
    (Error as any).captureStackTrace(err, skipUntil as any);
  }
  const stack = err.stack || '';
  const lines = stack.split('\n').slice(1);
  const loggerFileHints = [
    `${path.sep}logger`,
    `${path.sep}logger.service.ts`,
    `${path.sep}logger.service.js`,
    `${path.sep}kafka-logger`,
    `${path.sep}winston-logger`,
  ];

  const isInternal = (p: string) =>
    !p ||
    p.includes(`${path.sep}node_modules${path.sep}`) ||
    p.startsWith('node:') ||
    p.includes(`${path.sep}winston${path.sep}`) ||
    loggerFileHints.some((h) => p.includes(h));

  const isExcludedMain = (p: string) => {
    const n = p.replace(/\\/g, '/');
    return /\/src\/main\.(t|j)s$/i.test(n) || /\/dist(\/src)?\/main\.(t|j)s$/i.test(n);
  };

  const isProjectFrame = (p: string) => {
    const cwd = process.cwd().replace(/\\/g, '/');
    const n = p.replace(/\\/g, '/');
    return n.startsWith(cwd + '/') && !isInternal(p);
  };

  const matchesHint = (p: string, fn?: string) => {
    if (!hint) return false;
    const h = hint.toLowerCase();
    const n = p.toLowerCase();
    const fnn = (fn || '').toLowerCase();
    const base = h.replace(/(service|controller|module|resolver)$/i, '');
    return n.includes(h) || n.includes(base) || fnn.includes(h) || fnn.includes(base);
  };

  const shouldPrefer = (p: string) => {
    const n = p.replace(/\\/g, '/');
    return (n.includes('/src/') || n.includes('/dist/src/')) && !isExcludedMain(p);
  };

  let fallback: CallSite | undefined;
  let firstProjectFrame: CallSite | undefined;
  let firstHintMatch: CallSite | undefined;

  for (const raw of lines) {
    const line = raw.trim();
    const match = line.match(/^at\s+(?:(.+?)\s+\()?(.*?):(\d+):(\d+)\)?$/);
    if (!match) continue;
    const functionName = match[1];
    const absPath = match[2];
    const lineNum = Number(match[3]);
    const colNum = Number(match[4]);
    if (isInternal(absPath)) continue;

    const cwd = process.cwd();
    const relPath = path.relative(cwd, absPath).replace(/\\/g, '/');
    const source = `${relPath}:${lineNum}:${colNum}`;
    const sourceAbs = `${absPath}:${lineNum}:${colNum}`;
    const frame: CallSite = {
      source,
      sourceAbs,
      file: relPath,
      line: lineNum,
      column: colNum,
      function: functionName,
    };

    if (!firstHintMatch && matchesHint(absPath, functionName) && !isExcludedMain(absPath)) {
      firstHintMatch = frame;
    }
    if (shouldPrefer(absPath)) {
      return frame;
    }
    if (!firstProjectFrame && isProjectFrame(absPath) && !isExcludedMain(absPath)) {
      firstProjectFrame = frame;
    }
    if (!fallback) fallback = frame;
  }

  return firstHintMatch || firstProjectFrame || fallback || {};
}
