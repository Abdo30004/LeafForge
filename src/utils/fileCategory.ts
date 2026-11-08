export type FileCategory = 'text' | 'image' | 'pdf' | 'unsupported';

export const TEXT_EXTENSIONS = new Set([
  'tex',
  'ltx',
  'sty',
  'cls',
  'dtx',
  'ins',
  'def',
  'bib',
  'bst',
  'txt',
  'md',
  'markdown',
  'json',
  'yaml',
  'yml',
  'xml',
  'csv',
  'tsv',
  'lua',
  'py',
  'sh',
  'bat',
  'cmd',
  'js',
  'ts',
  'jsx',
  'tsx',
  'css',
  'html',
  'gitignore',
  'editorconfig',
  'toml',
  'cfg',
  'ini',
  'log',
]);

export const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'bmp',
  'ico',
  'tiff',
  'tif',
]);

export const BUILD_ARTIFACT_EXTENSIONS = new Set([
  'aux',
  'log',
  'out',
  'fls',
  'fdb_latexmk',
  'toc',
  'lof',
  'lot',
  'bbl',
  'blg',
  'nav',
  'snm',
  'vrb',
  'synctex',
  'gz',
  'bcf',
  'run.xml',
  'fmt',
]);

export function getFileExtension(filePath: string): string {
  const parts = filePath.split(/[/\\]/).pop() || '';
  const lastDot = parts.lastIndexOf('.');
  return lastDot > 0 ? parts.slice(lastDot + 1).toLowerCase() : '';
}

export function isBuildArtifact(fileName: string): boolean {
  if (fileName.startsWith('.')) return true;
  if (
    fileName.endsWith('.synctex.gz') ||
    fileName.endsWith('.synctex') ||
    fileName.endsWith('.run.xml') ||
    fileName.endsWith('.fdb_latexmk')
  ) {
    return true;
  }
  const ext = getFileExtension(fileName);
  return BUILD_ARTIFACT_EXTENSIONS.has(ext);
}

export function getFileCategory(filePath: string): FileCategory {
  const ext = getFileExtension(filePath);

  if (ext === 'pdf') {
    return 'pdf';
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return 'image';
  }
  if (TEXT_EXTENSIONS.has(ext)) {
    return 'text';
  }

  const fileName = filePath.split(/[/\\]/).pop() || '';
  if (fileName.startsWith('.') && !fileName.includes('.', 1)) {
    return 'text';
  }

  return 'unsupported';
}
