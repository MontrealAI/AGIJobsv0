import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { makeCatalog } from '../../scripts/pages/build.mjs';
const { inventory } = createRequire(import.meta.url)(
  '../../scripts/demo/catalog.cjs'
);

test('tracked nested guide fallback survives root-guide precedence without losing code identity', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-precedence-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const prefix = 'demo/superintelligent-empowerment/';
  const files = {
    'package.json': JSON.stringify({ scripts: {} }),
    [prefix + 'docs/README.md']: '# Original nested guide',
    [prefix + 'web/README.md']: '# Browser implementation guide',
    [prefix + 'run.py']: '# Implementation fixture; never executed',
  };
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  const read = () => makeCatalog(inventory(root))[0];
  const nested = read();
  assert.equal(nested.readme, prefix + 'docs/README.md');
  assert.equal(nested.kindId, 'code');
  assert.deepEqual(nested.guides, [
    prefix + 'docs/README.md',
    prefix + 'web/README.md',
  ]);
  fs.writeFileSync(path.join(root, prefix, 'README.md'), '# Root entry guide');
  assert.equal(
    read().readme,
    nested.readme,
    'untracked guides must not change the catalog'
  );
  execFileSync('git', ['-C', root, 'add', prefix + 'README.md']);
  const rooted = read();
  assert.equal(rooted.readme, prefix + 'README.md');
  assert.equal(rooted.kindId, 'code');
  assert.deepEqual(rooted.guides, [prefix + 'README.md', ...nested.guides]);
});
