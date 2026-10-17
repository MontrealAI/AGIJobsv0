'use strict';
// Bootstrap drift guard only. The operator must independently review the exact
// commit, Node executable and installed dependencies before invoking this file.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const LIMIT = 4 * 1024 * 1024;
const fail = () => {
  throw new Error('Conventional launch input or source check failed.');
};
const need = (value) => {
  if (!value) fail();
};
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const same = (a, b) =>
  ['dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].every(
    (k) => a[k] === b[k]
  );
function parents(file) {
  const pins = [];
  for (let p = path.dirname(file); ; p = path.dirname(p)) {
    const s = fs.lstatSync(p, { bigint: true });
    need(s.isDirectory() && !s.isSymbolicLink() && fs.realpathSync(p) === p);
    pins.push({ p, dev: s.dev, ino: s.ino, mode: s.mode, uid: s.uid });
    if (path.dirname(p) === p) return pins;
  }
}
function checkParents(pins) {
  for (const p of pins) {
    const s = fs.lstatSync(p.p, { bigint: true });
    need(
      s.isDirectory() &&
        !s.isSymbolicLink() &&
        s.dev === p.dev &&
        s.ino === p.ino &&
        s.mode === p.mode &&
        s.uid === p.uid
    );
  }
}
function pinFile(file, maxBytes = LIMIT, retain = true) {
  need(
    typeof file === 'string' &&
      path.isAbsolute(file) &&
      path.resolve(file) === file &&
      !/[\x00-\x1f\x7f]/.test(file)
  );
  const dirs = parents(file);
  let fd;
  try {
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
    );
    const before = fs.fstatSync(fd, { bigint: true });
    need(
      before.isFile() &&
        before.nlink === 1n &&
        before.uid === BigInt(process.getuid()) &&
        (before.mode & 0o022n) === 0n &&
        before.size <= BigInt(maxBytes)
    );
    const sha = crypto.createHash('sha256');
    const blobHash = crypto.createHash('sha1').update(`blob ${before.size}\0`);
    const buffer = Buffer.allocUnsafe(64 * 1024),
      chunks = [];
    let length = 0;
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!count) break;
      length += count;
      need(length <= maxBytes);
      const part = buffer.subarray(0, count);
      sha.update(part);
      blobHash.update(part);
      if (retain) chunks.push(Buffer.from(part));
    }
    const bytes = retain ? Buffer.concat(chunks) : undefined;
    const after = fs.fstatSync(fd, { bigint: true }),
      at = fs.lstatSync(file, { bigint: true });
    checkParents(dirs);
    need(
      same(before, after) &&
        same(after, at) &&
        !at.isSymbolicLink() &&
        length === Number(after.size)
    );
    const digest = sha.digest('hex'),
      blob = blobHash.digest('hex');
    return {
      file,
      bytes,
      digest,
      blob,
      stat: after,
      dirs,
      verify() {
        checkParents(dirs);
        const next = pinFile(file, maxBytes, false);
        need(same(after, next.stat) && next.digest === digest);
        return true;
      },
    };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
function pinDirectory(directory) {
  need(
    typeof directory === 'string' &&
      path.resolve(directory) === directory &&
      fs.realpathSync(directory) === directory
  );
  const dirs = parents(path.join(directory, '.identity-only'));
  const stat = fs.lstatSync(directory, { bigint: true });
  need(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      stat.uid === BigInt(process.getuid()) &&
      (stat.mode & 0o077n) === 0n
  );
  return () => {
    checkParents(dirs);
    return true;
  };
}
function assertEnvironment(root, env = process.env) {
  need(path.resolve(root) === root && fs.realpathSync(root) === root);
  for (const [name, value] of Object.entries(env)) {
    if (
      value &&
      (/PRIVATE[_-]?KEY|MNEMONIC|SEED_PHRASE|KEYSTORE|UNLOCKED|SIGNING_PROVIDER|^ACCOUNTS$|^NODE_OPTIONS$|^NODE_PATH$|^DEBUG$|^NODE_DEBUG(?:_NATIVE)?$|^ETHERS_DEBUG$|^HARDHAT_|^DOTENV_|^TS_NODE_|^GIT_/i.test(
        name
      ) ||
        [
          'DEPLOYMENT_EXTERNAL_PROFILE',
          'DEPLOY_DEFAULTS_CONFIG',
          'DEPLOY_DEFAULTS_OUTPUT',
          'DEPLOY_DEFAULTS_RESUME_EVIDENCE',
          'DEPLOYER_ADDRESS',
          'DEPLOY_DEFAULTS_SKIP_VERIFY',
          'DEPLOYMENT_LOCK_DIRECTORY',
          'AGJ_NETWORK',
          'AGIALPHA_NETWORK',
          'NETWORK',
          'TRUFFLE_NETWORK',
          'CHAIN_ID',
          'COVERAGE_ONLY',
        ].includes(name))
    )
      fail();
  }
  // The selected launcher never reads or silently loads dotenv files. Operators
  // must start in a clean reviewed checkout; renaming/removal is their action.
  need(!fs.existsSync(path.join(root, '.env')));
}
function sourcePath(p) {
  return (
    /^(scripts|contracts|config|shared)\//.test(p) ||
    [
      'hardhat.config.js',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'docs/deployment-addresses.mainnet.json',
    ].includes(p)
  );
}
function captureSource(root, commit, tree) {
  need(/^[0-9a-f]{40}$/.test(commit) && /^[0-9a-f]{40}$/.test(tree));
  const git = (args) =>
    execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        GIT_NO_LAZY_FETCH: '1',
        GIT_TERMINAL_PROMPT: '0',
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
  need(
    git(['rev-parse', 'HEAD']).trim() === commit &&
      git(['rev-parse', `${commit}^{tree}`]).trim() === tree
  );
  const entries = git(['ls-tree', '-rz', '--full-tree', commit])
    .split('\0')
    .filter(Boolean)
    .map((row) => {
      const m = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/.exec(row);
      return m ? { mode: m[1], blob: m[2], path: m[3] } : null;
    })
    .filter((e) => e && sourcePath(e.path));
  for (const required of [
    'hardhat.config.js',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'scripts/v2/deployDefaults.ts',
    'scripts/deploy/tty-launcher.cjs',
    'scripts/deploy/tty-source.cjs',
    'scripts/deploy/tty-secret.cjs',
    'scripts/deploy/tty-fee-signer.cjs',
    'docs/deployment-addresses.mainnet.json',
  ])
    need(entries.some((e) => e.path === required));
  const pins = entries.map((e) => {
    const pin = pinFile(path.join(root, e.path), 64 * 1024 * 1024, false);
    need(
      pin.blob === e.blob &&
        Boolean(pin.stat.mode & 0o111n) === (e.mode === '100755')
    );
    pin.bytes = undefined;
    return pin;
  });
  const tracked = new Set(entries.map((e) => e.path));
  function noUntrackedRuntime() {
    const walk = (relative) => {
      const full = path.join(root, relative);
      if (!fs.existsSync(full)) return;
      for (const item of fs.readdirSync(full, { withFileTypes: true })) {
        const p = path.posix.join(relative, item.name);
        need(!item.isSymbolicLink());
        if (item.isDirectory()) walk(p);
        else if (/\.(?:[cm]?js|tsx?|json|sol)$/.test(p)) need(tracked.has(p));
      }
    };
    ['scripts', 'contracts', 'config', 'shared'].forEach(walk);
    for (const item of fs.readdirSync(root))
      if (/^hardhat\.config\./.test(item)) need(tracked.has(item));
  }
  noUntrackedRuntime();
  const gitDir = git(['rev-parse', '--absolute-git-dir']).trim();
  const head = pinFile(path.join(gitDir, 'HEAD'));
  const ref = /^ref: (refs\/[A-Za-z0-9_./-]+)\n$/.exec(head.bytes.toString());
  const headPins = [head];
  let absentLooseRef;
  if (ref) {
    const refPath = path.join(gitDir, ref[1]);
    if (fs.existsSync(refPath)) headPins.push(pinFile(refPath));
    else {
      absentLooseRef = refPath;
      headPins.push(pinFile(path.join(gitDir, 'packed-refs')));
    }
  }
  return () => {
    need(!absentLooseRef || !fs.existsSync(absentLooseRef));
    need(!fs.existsSync(path.join(root, '.env')));
    noUntrackedRuntime();
    headPins.forEach((p) => p.verify());
    pins.forEach((p) => p.verify());
    return true;
  };
}
// Pin the actual compiler evidence displayed during review. A pre-existing
// artifact-directory symlink is permitted only with its exact link identity and
// resolved directory pinned; file pins are descriptor-first real paths.
function captureArtifacts(root, inventory) {
  const logical = path.join(root, 'artifacts');
  const link = fs.lstatSync(logical, { bigint: true });
  const actual = fs.realpathSync(logical);
  need(link.isDirectory() || link.isSymbolicLink());
  const pins = new Map();
  const add = (file, keep = false) => {
    if (!pins.has(file)) pins.set(file, pinFile(file, 128 * 1024 * 1024, keep));
    return pins.get(file);
  };
  for (const item of inventory) {
    need(
      /^[A-Za-z0-9_]+$/.test(item.name) &&
        /^contracts\/[A-Za-z0-9_./-]+\.sol$/.test(item.source) &&
        !item.source.split('/').includes('..')
    );
    const artifact = path.join(actual, item.source, `${item.name}.json`);
    add(artifact);
    const debug = add(artifact.replace(/\.json$/, '.dbg.json'), true);
    const buildInfo = JSON.parse(debug.bytes.toString('utf8')).buildInfo;
    need(typeof buildInfo === 'string');
    const build = path.resolve(path.dirname(artifact), buildInfo);
    need(build.startsWith(path.join(actual, 'build-info') + path.sep));
    add(build);
  }
  return () => {
    const now = fs.lstatSync(logical, { bigint: true });
    need(
      now.dev === link.dev &&
        now.ino === link.ino &&
        now.mode === link.mode &&
        now.uid === link.uid &&
        fs.realpathSync(logical) === actual
    );
    pins.forEach((pin) => pin.verify());
    return true;
  };
}
module.exports = {
  assertEnvironment,
  captureSource,
  captureArtifacts,
  pinFile,
  pinDirectory,
  hash,
};
