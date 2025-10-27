import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { agentIdentities, domainIds, validatorIdentities } from '../../src/config';
import { encodeLeaf } from '../../src/ens';
import { buildMerkleTree, getProof } from '../../src/merkle';
import { getAddress } from 'ethers';

export type ScenarioResult = {
  roundId: string;
  slashEvents: Array<{ validator: string; penalty: string; reason: string }>;
  domainPaused: boolean;
};

function groupIdentities() {
  const mainValidators = validatorIdentities.filter((entry) => !entry.ensName.includes('.alpha.'));
  const alphaValidators = validatorIdentities.filter((entry) => entry.ensName.includes('.alpha.'));
  const mainAgents = agentIdentities.filter((entry) => !entry.ensName.includes('.alpha.'));
  const alphaAgents = agentIdentities.filter((entry) => entry.ensName.includes('.alpha.'));
  return { mainValidators, alphaValidators, mainAgents, alphaAgents };
}

function buildTree(identities: typeof validatorIdentities) {
  if (identities.length === 0) {
    throw new Error('identities required');
  }
  return buildMerkleTree(identities.map((identity) => encodeLeaf(identity)));
}

const requireModule = createRequire(import.meta.url);

function runHardhat(config: unknown): Promise<ScenarioResult> {
  return new Promise((resolve, reject) => {
    const cwd = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
    const hardhatConfig = path.join(cwd, 'hardhat.config.ts');
    const scriptPath = path.join(cwd, 'scripts', 'hardhat', 'runScenario.ts');
    const child = spawn(
      'npx',
      ['hardhat', '--config', hardhatConfig, 'run', '--network', 'hardhat', scriptPath],
      {
        env: {
          ...process.env,
          CONSTELLATION_SCENARIO: JSON.stringify(config),
        },
        cwd,
        stdio: ['inherit', 'pipe', 'inherit'],
      }
    );
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Hardhat scenario failed with exit code ${code}`));
        return;
      }
      const match = stdout.match(/Scenario report saved to (.*\.json)/);
      if (!match) {
        reject(new Error('Unable to locate scenario report path'));
        return;
      }
      resolve(requireModule(match[1]) as ScenarioResult);
    });
  });
}

export async function runScenario(): Promise<ScenarioResult> {
  const { mainValidators, alphaValidators, mainAgents, alphaAgents } = groupIdentities();
  const validatorTree = buildTree(mainValidators);
  const validatorAlphaTree = buildTree(alphaValidators);
  const agentTree = buildTree(mainAgents);
  const agentAlphaTree = buildTree(alphaAgents);

  const scenario = {
    validatorRoot: validatorTree.root,
    validatorAlphaRoot: validatorAlphaTree.root,
    agentRoot: agentTree.root,
    agentAlphaRoot: agentAlphaTree.root,
    validators: validatorIdentities.map((identity) => ({
      address: getAddress(identity.address.toLowerCase()),
      ensName: identity.ensName,
      ensNode: identity.ensNode,
      proof: identity.ensName.includes('.alpha.')
        ? getProof(validatorAlphaTree, encodeLeaf(identity))
        : getProof(validatorTree, encodeLeaf(identity)),
      isAlpha: identity.ensName.includes('.alpha.'),
    })),
    agents: agentIdentities.map((identity) => ({
      address: getAddress(identity.address.toLowerCase()),
      ensName: identity.ensName,
      ensNode: identity.ensNode,
      proof: identity.ensName.includes('.alpha.')
        ? getProof(agentAlphaTree, encodeLeaf(identity))
        : getProof(agentTree, encodeLeaf(identity)),
      isAlpha: identity.ensName.includes('.alpha.'),
    })),
    sentinels: [
      { reporter: validatorIdentities[0].address },
    ],
    domain: domainIds.orbital,
  } as const;

  return runHardhat(scenario);
}
