'use strict';
// Fixed hosted-only paths, never caller-selected read/copy destinations.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const HOSTED_ROOT = '/tmp/jobs-external-manual-hosted';
const PUBLIC_FILE = path.join(HOSTED_ROOT, 'public', 'qualification.json');
function git(root, ...args) {
  return cp
    .execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        GIT_CONFIG_NOSYSTEM: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 4 * 1024 * 1024,
    })
    .trim();
}
function getSourceIdentity(root) {
  assert.equal(
    git(root, 'rev-parse', '--show-toplevel'),
    fs.realpathSync(root)
  );
  assert.equal(git(root, 'rev-parse', '--is-shallow-repository'), 'false');
  const sourceCommit = git(root, 'rev-parse', '--verify', 'HEAD^{commit}');
  const sourceTree = git(root, 'rev-parse', '--verify', 'HEAD^{tree}');
  assert.match(sourceCommit, /^[a-f0-9]{40}$/);
  assert.match(sourceTree, /^[a-f0-9]{40}$/);
  assert.equal(
    process.env.GITHUB_ACTIONS,
    'true',
    'This entrypoint is hosted qualification only'
  );
  assert.equal(
    process.env.JOBS_QUALIFICATION_EXPECTED_SHA,
    sourceCommit,
    'Checked-out HEAD must equal the immutable workflow SHA'
  );
  return { sourceCommit, sourceTree };
}
function assertCleanSource(root) {
  assert.equal(
    git(root, 'status', '--porcelain=v1', '--untracked-files=no'),
    '',
    'Tracked source changed'
  );
  // No source-predicate exemptions. Hardhat's derived TypeChain directory is
  // untracked build output, not part of the tracked source identity.
  const untracked = git(
    root,
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z'
  )
    .split('\0')
    .filter(Boolean);
  assert(
    untracked.every((file) => file.startsWith('typechain-types/')),
    'Unexpected untracked source/output'
  );
  return {
    trackedSourceClean: true,
    generatedUntrackedTypechainFiles: untracked.length,
  };
}
function readPrivateJson(file, maxBytes = 4 * 1024 * 1024) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    assert(
      stat.isFile() &&
        stat.uid === process.getuid() &&
        stat.nlink === 1 &&
        !(stat.mode & 0o077)
    );
    assert(stat.size > 0 && stat.size <= maxBytes);
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(
        fd,
        bytes,
        offset,
        bytes.length - offset,
        offset
      );
      assert(count > 0);
      offset += count;
    }
    assert.equal(fs.fstatSync(fd).size, bytes.length);
    return JSON.parse(bytes.toString('utf8'));
  } finally {
    fs.closeSync(fd);
  }
}
function processIdentity(pid) {
  const fields = fs
    .readFileSync(`/proc/${pid}/stat`, 'utf8')
    .split(')')
    .slice(1)
    .join(')')
    .trim()
    .split(/\s+/);
  return {
    pid,
    state: fields[0],
    group: Number(fields[2]),
    session: Number(fields[3]),
    start: fields[19],
  };
}
function processGroupIdentity(pid) {
  const value = processIdentity(pid);
  assert.equal(value.group, pid);
  assert.equal(value.session, pid);
  return value;
}
function assertGroupLeader(identity) {
  const now = processGroupIdentity(identity.pid);
  assert.equal(
    now.start,
    identity.start,
    'PID reused; refusing ownership claim'
  );
  assert.notEqual(now.state, 'Z', 'Owned supervisor is not live');
}
function ownedGroupIdentities(identity) {
  const found = [];
  for (const name of fs
    .readdirSync('/proc')
    .filter((name) => /^\d+$/.test(name))) {
    try {
      const now = processIdentity(Number(name));
      if (now.group !== identity.group) continue;
      assert.equal(
        now.session,
        identity.session,
        'Owned process group session changed'
      );
      if (now.pid === identity.pid)
        assert.equal(
          now.start,
          identity.start,
          'PID reused; refusing ownership claim'
        );
      found.push(now);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error;
    }
  }
  return found;
}
function ownedGroupMembers(identity) {
  return ownedGroupIdentities(identity).map((member) => member.pid);
}
// Used only by the live harness leader. Children inherit this group/session;
// enumerating the group, rather than direct handles, also finds orphaned TS children.
async function stopOwnedGroupChildren(identity, milliseconds = 3000) {
  assert.equal(
    identity.pid,
    process.pid,
    'Only the live supervisor may exclude itself'
  );
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    const end = Date.now() + milliseconds;
    do {
      assertGroupLeader(identity);
      const members = ownedGroupIdentities(identity).filter(
        (item) => item.pid !== identity.pid
      );
      if (!members.length) return true;
      for (const member of members) {
        try {
          assertGroupLeader(identity);
          const now = processIdentity(member.pid);
          assert.equal(
            now.start,
            member.start,
            'Child PID reused; refusing signal'
          );
          assert.equal(now.group, identity.group, 'Child escaped owned group');
          assert.equal(
            now.session,
            identity.session,
            'Child escaped owned session'
          );
          process.kill(now.pid, signal);
        } catch (error) {
          if (error.code !== 'ENOENT' && error.code !== 'ESRCH') throw error;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (Date.now() < end);
  }
  assertGroupLeader(identity);
  return ownedGroupMembers(identity).every((pid) => pid === identity.pid);
}
const sha256 = (bytes) =>
  crypto.createHash('sha256').update(bytes).digest('hex');
function assertExpectedNormalization(
  originalSha256,
  expectedSha256,
  observedSha256
) {
  assert(
    observedSha256 === expectedSha256 || observedSha256 === originalSha256,
    'Unexpected ENS bytes; refusing acceptance or overwrite'
  );
}
function fixtureFileIdentity(file) {
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
  return [stat.dev, stat.ino, stat.uid, stat.mode, stat.nlink];
}
function restoreFixtureFile(
  file,
  identity,
  original,
  expectedSha256,
  childrenStopped
) {
  assert.equal(
    childrenStopped,
    true,
    'Mutating descendants are not verified stopped'
  );
  // An unexpected inode or bytes are deliberately left untouched for inspection.
  assert.deepEqual(
    fixtureFileIdentity(file),
    identity,
    'ENS file identity changed; refusing overwrite'
  );
  const observed = sha256(fs.readFileSync(file));
  assertExpectedNormalization(sha256(original), expectedSha256, observed);
  if (observed !== sha256(original)) fs.writeFileSync(file, original);
  assert(
    fs.readFileSync(file).equals(original),
    'Original ENS bytes not restored'
  );
  return true;
}
function signalOwnedGroup(identity, signal) {
  if (!ownedGroupMembers(identity).length) return;
  try {
    process.kill(-identity.group, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
async function waitOwnedGroupEmpty(identity, milliseconds = 3000) {
  const end = Date.now() + milliseconds;
  while (ownedGroupMembers(identity).length) {
    if (Date.now() >= end) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}
module.exports = {
  HOSTED_ROOT,
  PUBLIC_FILE,
  git,
  getSourceIdentity,
  assertCleanSource,
  readPrivateJson,
  processIdentity,
  processGroupIdentity,
  assertGroupLeader,
  stopOwnedGroupChildren,
  assertExpectedNormalization,
  fixtureFileIdentity,
  restoreFixtureFile,
  ownedGroupMembers,
  signalOwnedGroup,
  waitOwnedGroupEmpty,
};
