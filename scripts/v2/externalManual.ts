// Trusted-machine native command entrypoint. The reviewed runtime supplies the
// read-only provider. Requests contain no RPC URL, module path, calldata or nonce.
import * as fs from 'node:fs';
import { ethers, network } from 'hardhat';
const { loadExternalProfile } = require('../deploy/external-profile.cjs');
const {
  runCommand,
  readCommandRequest,
} = require('../deploy/external-command.cjs');
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
  const request = readCommandRequest(requestPath);
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
