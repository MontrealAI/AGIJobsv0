// Trusted-machine native command entrypoint. The reviewed runtime supplies the
// read-only provider. Requests contain no RPC URL, module path, calldata or nonce.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ethers, network } from 'hardhat';
const {
  loadExternalProfile,
  parseJson,
} = require('../deploy/external-profile.cjs');
const { runCommand } = require('../deploy/external-command.cjs');
const allowed = new Set([
  'inspect',
  'handoff',
  'retrieve',
  'import-signed',
  'authorize-relay',
  'observe',
  'repair-head',
  'recover-command',
]);

export async function main() {
  const configPath = process.env.DEPLOY_DEFAULTS_CONFIG;
  const profilePath = process.env.DEPLOYMENT_EXTERNAL_PROFILE;
  const requestPath = process.env.DEPLOYMENT_EXTERNAL_COMMAND_FILE;
  if (!configPath || !profilePath || !requestPath)
    throw new Error(
      'Explicit reviewed deployment config, external profile and private command request are required'
    );
  if (
    !['hardhat', 'localhost', 'anvil'].includes(network.name) &&
    (!Array.isArray((network.config as any).accounts) ||
      (network.config as any).accounts.length !== 0)
  )
    throw new Error(
      'External public commands require empty configured network accounts'
    );
  const profile = loadExternalProfile(profilePath, {
    provider: ethers.provider,
    root: process.cwd(),
    configPath,
    configBytes: fs.readFileSync(configPath, 'utf8'),
  });
  const file = path.resolve(requestPath),
    stat = fs.lstatSync(file);
  const parent = fs.lstatSync(path.dirname(file));
  if (
    !path.isAbsolute(requestPath) ||
    requestPath !== file ||
    fs.realpathSync(path.dirname(file)) !== path.dirname(file) ||
    parent.uid !== process.getuid!() ||
    parent.mode & 0o077 ||
    stat.nlink !== 1 ||
    fs.realpathSync(file) !== file ||
    !stat.isFile() ||
    stat.uid !== process.getuid!() ||
    stat.mode & 0o077 ||
    stat.size > 64 * 1024 ||
    file.startsWith(path.resolve(process.cwd()) + path.sep)
  )
    throw new Error(
      'Command request must be a bounded owner-only real file outside the source tree'
    );
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let request;
  try {
    const before = fs.fstatSync(fd);
    if (
      before.ino !== stat.ino ||
      before.dev !== stat.dev ||
      before.size !== stat.size
    )
      throw new Error('Private command request changed before reading');
    request = parseJson(fs.readFileSync(fd));
    const after = fs.fstatSync(fd),
      current = fs.lstatSync(file);
    if (
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      current.ino !== stat.ino ||
      current.dev !== stat.dev
    )
      throw new Error('Private command request changed during reading');
  } finally {
    fs.closeSync(fd);
  }
  if (
    !request ||
    Object.getPrototypeOf(request) !== Object.prototype ||
    !allowed.has(request.command) ||
    Object.keys(request).some(
      (key) =>
        ![
          'command',
          'review',
          'signedFile',
          'acknowledgement',
          'output',
        ].includes(key)
    )
  )
    throw new Error('Unsupported external command request');
  const result = await runCommand({ session: profile.session, ...request });
  // The adapter returns only safe status metadata. Signed raw bytes go only to
  // a newly reserved private output and are never rendered to stdout.
  console.log(JSON.stringify(result));
}
if (require.main === module)
  main().catch(() => {
    console.error(
      'External command stopped. Inspect the original private session; do not re-sign, resend, replace a nonce or discard retained evidence.'
    );
    process.exitCode = 1;
  });
