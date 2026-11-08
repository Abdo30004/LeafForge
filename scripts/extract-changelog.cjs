const fs = require('fs');
const path = require('path');

function extractChangelog(changelogPath, versionArg) {
  if (!fs.existsSync(changelogPath)) {
    return '';
  }

  const content = fs.readFileSync(changelogPath, 'utf8');
  let targetVersion = (versionArg || '').trim();
  
  // If no version supplied, try package.json
  if (!targetVersion) {
    try {
      const pkgPath = path.join(__dirname, '..', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      targetVersion = pkg.version;
    } catch {
      targetVersion = '';
    }
  }

  // Strip leading 'v' if present: v0.6.4 -> 0.6.4
  const cleanVersion = targetVersion.replace(/^v/i, '');

  if (!cleanVersion) {
    return '';
  }

  const lines = content.split('\n');
  let capturing = false;
  const capturedLines = [];

  // Match: ## [0.6.4] or ## 0.6.4 or ## [v0.6.4] (with optional date e.g. - 2026-11-08)
  const versionRegex = new RegExp(`^##\\s*\\[?v?${cleanVersion.replace(/\./g, '\\.')}\\]?(?:\\s+-\\s+.*)?$`, 'i');
  const nextSectionRegex = /^##\s+/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!capturing) {
      if (versionRegex.test(line.trim())) {
        capturing = true;
        capturedLines.push(line);
      }
    } else {
      // Check if we hit the next major section (## ...)
      if (nextSectionRegex.test(line.trim())) {
        break;
      }
      capturedLines.push(line);
    }
  }

  return capturedLines.join('\n').trim();
}

if (require.main === module) {
  const target = process.argv[2];
  const changelogFile = path.join(__dirname, '..', 'CHANGELOG.md');
  const result = extractChangelog(changelogFile, target);
  if (result) {
    process.stdout.write(result + '\n');
  }
}

module.exports = { extractChangelog };
