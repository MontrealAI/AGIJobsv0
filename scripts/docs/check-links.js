#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(full);
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      return [full];
    }
    return [];
  });
}

function normaliseLink(raw) {
  let link = raw.trim();
  if (link.startsWith('<') && link.endsWith('>')) {
    link = link.slice(1, -1);
  }
  const hashIndex = link.indexOf('#');
  if (hashIndex >= 0) {
    link = link.slice(0, hashIndex);
  }
  return link;
}

function isExternal(link) {
  return (
    link.startsWith('http://') ||
    link.startsWith('https://') ||
    link.startsWith('mailto:') ||
    link.startsWith('tel:') ||
    link.startsWith('data:') ||
    link.startsWith('ipfs://')
  );
}

function resolveTarget(markdownPath, target) {
  if (!target) {
    return null;
  }
  if (target.startsWith('/')) {
    return path.join(repoRoot, target.slice(1));
  }
  return path.resolve(path.dirname(markdownPath), target);
}

function collectMarkdownFiles() {
  const docsDir = path.join(repoRoot, 'docs');
  const files = walk(docsDir);
  files.push(path.join(repoRoot, 'README.md'));
  files.push(path.join(repoRoot, 'MIGRATION.md'));
  files.push(path.join(repoRoot, 'CHANGELOG.md'));
  files.push(path.join(repoRoot, 'SECURITY.md'));
  return [...new Set(files.filter((file) => fs.existsSync(file)))];
}

const markdownFiles = collectMarkdownFiles();
const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
const failures = [];

for (const file of markdownFiles) {
  const contents = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = linkPattern.exec(contents)) !== null) {
    const startIndex = match.index;
    const prevChar = startIndex > 0 ? contents[startIndex - 1] : '';
    if (prevChar && !/\s|\(|>|!|`/.test(prevChar)) {
      continue;
    }
    const targetRaw = match[1];
    const target = normaliseLink(targetRaw);
    if (!target || target.startsWith('#') || target.startsWith('?')) {
      continue;
    }
    if (isExternal(target)) {
      continue;
    }
    const resolved = resolveTarget(file, target);
    if (!resolved) {
      continue;
    }
    if (!fs.existsSync(resolved)) {
      failures.push({ file, target: targetRaw, resolved });
    }
  }
}

if (failures.length > 0) {
  console.error('Broken documentation links detected:');
  for (const failure of failures) {
    console.error(`- ${path.relative(repoRoot, failure.file)} → ${failure.target} (expected ${failure.resolved})`);
  }
  process.exit(1);
}

console.log(`Documentation links verified across ${markdownFiles.length} Markdown files.`);
