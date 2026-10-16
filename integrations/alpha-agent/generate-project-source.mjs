#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { SOURCE_PATHS, SOURCE_SELECTOR_PATH, pendingSourceSelection, readSourceSelection, renderSourceSelector, validateSelectorModule, assertPinnedSelection } from './project-source-policy.mjs';
import { canonical } from './vendor/alpha/docs/assets/successor/engine.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function fail(ok, code) { if (!ok) throw Error(code); }
function git(...args) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (name.startsWith('GIT_')) delete env[name];
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_COUNT: '0' });
  return execFileSync('git', ['--no-replace-objects', '-C', root, ...args], { env, stdio: ['ignore','pipe','pipe'], timeout: 10000, maxBuffer: 10_000_000 });
}
export function sourceSnapshot(commit) {
  fail(typeof commit === 'string' && /^[0-9a-f]{40}$/.test(commit), 'JOBS_SOURCE_COMMIT');
  fail(git('cat-file','-t',commit).toString('utf8').trim() === 'commit', 'JOBS_SOURCE_COMMIT');
  const refs = git('for-each-ref','--format=%(objectname)','refs/remotes/origin/').toString('utf8').trim().split('\n').filter(Boolean);
  const fetched = refs.includes(commit) || git('for-each-ref','--contains='+commit,'--format=%(refname)','refs/remotes/origin/').toString('utf8').trim().length > 0;
  fail(fetched, 'JOBS_SOURCE_PUBLISHED_REF_REQUIRED');
  const tree = git('rev-parse',commit+'^{tree}').toString('utf8').trim();
  fail(/^[0-9a-f]{40}$/.test(tree), 'JOBS_SOURCE_TREE');
  const files = SOURCE_PATHS.map(relative => {
    const entry = git('ls-tree','-z',commit,'--',relative).toString('utf8');
    const match = /^(100644|100755) blob ([0-9a-f]{40})\t([^\0]+)\0$/.exec(entry);
    fail(match && match[3] === relative, 'JOBS_SOURCE_REGULAR_BLOB');
    const expected = git('cat-file','blob',match[2]), file = path.join(root,relative);
    fail(fs.lstatSync(file).isFile() && fs.realpathSync(file) === file && fs.readFileSync(file).equals(expected), 'JOBS_SOURCE_BYTES_CHANGED');
    return { path: relative, sha256: createHash('sha256').update(expected).digest('hex') };
  });
  return readSourceSelection(canonical({ ...pendingSourceSelection(), status: 'pinned', commit, tree, files }));
}
export function verifySelectedSource() {
  const source = validateSelectorModule(fs.readFileSync(path.join(root,SOURCE_SELECTOR_PATH),'utf8'));
  assertPinnedSelection(source);
  fail(canonical(source) === canonical(sourceSnapshot(source.commit)), 'JOBS_SOURCE_SNAPSHOT_MISMATCH');
  return source;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action,commit,...rest] = process.argv.slice(2);
    fail(rest.length === 0, 'JOBS_SOURCE_USAGE');
    if (action === '--write' && commit) {
      const source = sourceSnapshot(commit);
      fs.writeFileSync(path.join(root,SOURCE_SELECTOR_PATH),renderSourceSelector(source));
      process.stdout.write('Selected fetched immutable code snapshot '+commit+' with '+source.files.length+' exact source files.\n');
    } else if (action === '--check' && !commit) {
      const source = verifySelectedSource();
      process.stdout.write('Verified exact code snapshot '+source.commit+' and selector grammar.\n');
    } else throw Error('JOBS_SOURCE_USAGE');
  } catch { process.stderr.write('JOBS_SOURCE_SELECTION_FAILED\n'); process.exitCode = 1; }
}
