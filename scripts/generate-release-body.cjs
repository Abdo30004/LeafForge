const fs = require('fs');
const path = require('path');
const { extractChangelog } = require('./extract-changelog.cjs');

function generateReleaseBody(tagName) {
  const cleanTag = (tagName || '').trim() || 'v0.6.4';
  const changelogFile = path.join(__dirname, '..', 'CHANGELOG.md');
  const changelogEntry = extractChangelog(changelogFile, cleanTag);

  let body = `## LeafForge ${cleanTag} — Local-First Collaborative LaTeX Desktop Studio

### Release Assets:
- **Windows:** \`.msi\` (WiX Installer) & \`.exe\` (NSIS Setup)
- **macOS:** \`.dmg\` (Apple Silicon & Intel Universal)
- **Linux:** \`.AppImage\`, \`.deb\` & \`.rpm\`

### Key Features:
- Dual-Mode CodeMirror 6 BiDi / Visual WYSIWYM Editor
- First-Class Arabic/Hebrew BiDi (UAX #9) with LTR command isolation
- Hybrid Compiler Pool (Tectonic Auto-CTAN + TeX Live) with sub-second preamble caching
- Native SyncTeX two-way forward/inverse navigation
- Native \`libgit2\` Git engine with OS Keychain token integration
- E2EE Yjs real-time collaboration with designated committer election & 3-way reconciliation`;

  if (changelogEntry) {
    body += `\n\n---\n\n### Release Changelog:\n\n${changelogEntry}`;
  }

  return body;
}

if (require.main === module) {
  const tagName = process.argv[2] || process.env.GITHUB_REF_NAME || '';
  const body = generateReleaseBody(tagName);

  // If running in GitHub Actions with GITHUB_ENV available
  if (process.env.GITHUB_ENV) {
    const delimiter = `DELIMITER_${Date.now()}`;
    const envPayload = `LEAFFORGE_RELEASE_BODY<<${delimiter}\n${body}\n${delimiter}\n`;
    fs.appendFileSync(process.env.GITHUB_ENV, envPayload, 'utf8');
  }

  process.stdout.write(body + '\n');
}

module.exports = { generateReleaseBody };
