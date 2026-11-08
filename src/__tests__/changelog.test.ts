import { describe, it, expect } from 'vitest';
import path from 'path';
// @ts-expect-error cjs import
import { extractChangelog } from '../../scripts/extract-changelog.cjs';
// @ts-expect-error cjs import
import { generateReleaseBody } from '../../scripts/generate-release-body.cjs';

describe('Changelog System & Release Body Generation', () => {
  const changelogPath = path.join(__dirname, '..', '..', 'CHANGELOG.md');

  it('extracts version 0.6.4 changelog entry accurately', () => {
    const entry = extractChangelog(changelogPath, '0.6.4');
    expect(entry).toContain('## [0.6.4]');
    expect(entry).toContain('LeafForge Custom Modal Dialog System');
    expect(entry).toContain('No Preview available');
    expect(entry).not.toContain('## [0.6.3]');
  });

  it('handles version tags with leading "v" (e.g. v0.6.4)', () => {
    const entry = extractChangelog(changelogPath, 'v0.6.4');
    expect(entry).toContain('## [0.6.4]');
    expect(entry).toContain('LeafForge Custom Modal Dialog System');
  });

  it('extracts earlier versions like 0.6.3 cleanly', () => {
    const entry = extractChangelog(changelogPath, 'v0.6.3');
    expect(entry).toContain('## [0.6.3]');
    expect(entry).toContain('Hidden Compiler Workspace Directory');
    expect(entry).not.toContain('## [0.6.4]');
    expect(entry).not.toContain('## [0.6.2]');
  });

  it('generates complete release body with key features and changelog section', () => {
    const body = generateReleaseBody('v0.6.4');
    expect(body).toContain('## LeafForge v0.6.4 — Local-First Collaborative LaTeX Desktop Studio');
    expect(body).toContain('### Release Assets:');
    expect(body).toContain('### Key Features:');
    expect(body).toContain('### Release Changelog:');
    expect(body).toContain('## [0.6.4]');
  });
});
