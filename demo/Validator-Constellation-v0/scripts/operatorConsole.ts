#!/usr/bin/env ts-node
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ValidatorConstellation } from '../src/validatorConstellation';
import { CommitRevealWindowConfig } from '../src/types';

const config: CommitRevealWindowConfig = {
  commitWindowSeconds: 300,
  revealWindowSeconds: 300,
  vrfSeed: 'operator-console',
  validatorsPerJob: 5,
  revealQuorum: 3,
  nonRevealPenaltyBps: 600,
  incorrectVotePenaltyBps: 1200,
};

const constellation = new ValidatorConstellation(config, '0xoperator');

async function main() {
  const rl = readline.createInterface({ input, output });
  console.log('Validator Constellation Operator Console');
  console.log('Commands: register-validator, register-agent, request-job, list-state, pause-domain, resume-domain, exit');

  const help = () => {
    console.log('register-validator <address> <ens> <domain> <stake>');
    console.log('register-agent <address> <ens> <domain> <budget>');
    console.log('request-job <jobId> <domain>');
    console.log('pause-domain <domain> <reason>');
    console.log('resume-domain <domain>');
    console.log('list-state');
    console.log('exit');
  };

  help();

  while (true) {
    const line = await rl.question('> ');
    const [command, ...args] = line.trim().split(/\s+/);
    try {
      if (command === 'register-validator') {
        const [address, ensName, domain, stakeStr] = args;
        constellation.registerValidator(
          {
            address,
            ensName,
            domain,
            stake: BigInt(stakeStr),
            registeredAt: Date.now(),
            active: true,
          },
          {
            ensName,
            owner: '0xoperator',
            signature: '0xconsole',
            issuedAt: Date.now(),
            expiresAt: Date.now() + 600_000,
          },
        );
        console.log('Validator registered');
      } else if (command === 'register-agent') {
        const [address, ensName, domain, budgetStr] = args;
        constellation.registerAgent(
          { address, ensName, domain, budget: BigInt(budgetStr) },
          {
            ensName,
            owner: '0xoperator',
            signature: '0xconsole',
            issuedAt: Date.now(),
            expiresAt: Date.now() + 600_000,
          },
        );
        console.log('Agent registered');
      } else if (command === 'request-job') {
        const [jobId, domain] = args;
        const round = constellation.requestValidation(jobId, domain, jobId);
        console.log('Committee:', round.committee.join(','));
      } else if (command === 'pause-domain') {
        const [domain, ...reasonParts] = args;
        const reason = reasonParts.join(' ') || 'operator intervention';
        constellation.pauseDomain(domain, reason, '0xoperator');
        console.log(`Domain ${domain} paused`);
      } else if (command === 'resume-domain') {
        const [domain] = args;
        constellation.resumeDomain(domain, '0xoperator');
        console.log(`Domain ${domain} resumed`);
      } else if (command === 'list-state') {
        const dashboard = constellation.buildDashboard();
        console.log(JSON.stringify(dashboard, null, 2));
      } else if (command === 'exit') {
        break;
      } else {
        console.log('Unknown command');
        help();
      }
    } catch (error) {
      console.error('Error:', (error as Error).message);
    }
  }

  rl.close();
}

main().catch((error) => {
  console.error('Console failed', error);
  process.exitCode = 1;
});
