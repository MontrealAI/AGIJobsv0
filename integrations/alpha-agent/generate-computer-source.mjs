import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { boundedSourceBlob } from './pinned-alpha-checkout.cjs';

const target = fileURLToPath(
  new URL('./vendor/alpha-computer/', import.meta.url)
);
const entry = 'examples/successor-alpha/computer.mjs';
const digest = (bytes) =>
  crypto.createHash('sha256').update(bytes).digest('hex');

/** Vendor complete native module bytes; esbuild parses actual imports, including reexports. */
export async function computerSourceSnapshot(alphaRoot, commit) {
  if (
    !path.isAbsolute(alphaRoot) ||
    fs.realpathSync(alphaRoot) !== alphaRoot ||
    !/^[a-f0-9]{40}$/.test(commit)
  )
    throw Error('Exact physical Alpha checkout and commit required');
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '--no-replace-objects',
        '-c',
        'core.fsmonitor=false',
        '-C',
        alphaRoot,
        ...args,
      ],
      {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_SYSTEM: '/dev/null',
          GIT_CONFIG_NOSYSTEM: '1',
        },
      }
    ).trim();
  if (git('rev-parse', 'HEAD') !== commit)
    throw Error('Alpha checkout differs from selected source');
  const result = await build({
    absWorkingDir: alphaRoot,
    entryPoints: [entry, 'examples/successor-alpha/learning.mjs'],
    outdir: 'source-inventory-only',
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  const files = new Map();
  const manifest = {
    schema: 'agijobsv0/alpha-computer-browser-source/v1',
    repository: 'MontrealAI/AGI-Alpha-Agent-v0',
    commit,
    tree: git('rev-parse', 'HEAD^{tree}'),
    entry,
    files: {},
  };
  for (const relative of [
    ...new Set([...Object.keys(result.metafile.inputs), 'LICENSE']),
  ].sort()) {
    const absolute = path.resolve(alphaRoot, relative);
    if (
      !absolute.startsWith(alphaRoot + path.sep) ||
      fs.realpathSync(absolute) !== absolute
    )
      throw Error('Alpha source must be a contained regular Git file');
    const treeEntry = git('ls-tree', '-z', commit, '--', relative);
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t([^\0]+)\0$/.exec(
      treeEntry
    );
    if (!match || match[3] !== relative)
      throw Error('Alpha source must be a regular Git blob');
    const object = match[2];
    const bytes = execFileSync(
      'git',
      ['--no-replace-objects', '-C', alphaRoot, 'cat-file', 'blob', object],
      { maxBuffer: 8_388_608 }
    );
    const fd = fs.openSync(
      absolute,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
    );
    try {
      const captured = boundedSourceBlob(fd, Math.max(bytes.length, 1), true);
      const mode = captured.stat.mode & 0o111 ? '100755' : '100644';
      if (
        captured.blob !== object ||
        mode !== match[1] ||
        !bytes.equals(captured.bytes)
      )
        throw Error(`Alpha source differs from selected Git object: ${relative}`);
    } finally {
      fs.closeSync(fd);
    }
    files.set(relative, bytes);
    manifest.files[relative] = {
      bytes: bytes.length,
      sha256: digest(bytes),
      gitBlob: object,
    };
  }
  files.set(
    'source-manifest.json',
    Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
  );
  files.set(
    'source-identity.mjs',
    Buffer.from('export default ' + JSON.stringify(manifest, null, 2) + ';\n')
  );
  return { manifest, files };
}

export function verifyComputerSource(snapshot, directory = target) {
  if (
    !fs.lstatSync(directory).isDirectory() ||
    fs.lstatSync(directory).isSymbolicLink()
  )
    throw Error('Vendored source root must be a regular directory');
  const observed = [];
  function visit(current, prefix = '') {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const relative = prefix + item.name;
      if (item.isDirectory())
        visit(path.join(current, item.name), relative + '/');
      else {
        if (!item.isFile() || item.isSymbolicLink())
          throw Error('Unexpected vendored source file');
        observed.push(relative);
        if (
          !snapshot.files
            .get(relative)
            ?.equals(fs.readFileSync(path.join(current, item.name)))
        )
          throw Error(`Vendored source differs: ${relative}`);
      }
    }
  }
  visit(directory);
  if (
    JSON.stringify(observed.sort()) !==
    JSON.stringify([...snapshot.files.keys()].sort())
  )
    throw Error('Vendored source inventory differs');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [alphaRoot, commit, mode] = process.argv.slice(2);
  if (!['--write', '--check'].includes(mode) || process.argv.length !== 5)
    throw Error(
      'Usage: node generate-computer-source.mjs EXACT_ALPHA_ROOT EXACT_COMMIT --write|--check'
    );
  const snapshot = await computerSourceSnapshot(alphaRoot, commit);
  if (mode === '--write') {
    // This dedicated generated directory never shares the historical CSV source inventory.
    fs.rmSync(target, { recursive: true, force: true });
    for (const [relative, bytes] of snapshot.files) {
      const filename = path.join(target, relative);
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename, bytes);
    }
  }
  verifyComputerSource(snapshot);
  console.log(
    JSON.stringify({
      commit,
      tree: snapshot.manifest.tree,
      files: snapshot.files.size,
      exactNativeBytes: true,
    })
  );
}
