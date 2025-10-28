import fs from 'fs';
import path from 'path';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { auditRound } from '../src/core/auditor';
import { DemoOrchestrationReport, GovernanceParameters, Hex, JobResult, VoteValue } from '../src/core/types';

interface SummaryFile {
  governance: { parameters: GovernanceParameters; zkVerifyingKey: Hex; entropy: { after?: { onChainEntropy: Hex; recentBeacon: Hex }; before?: { onChainEntropy: Hex; recentBeacon: Hex } } };
  truthfulVote: VoteValue;
  round: number;
  scenarioName?: string;
}

function loadJson<T>(target: string): T {
  if (!fs.existsSync(target)) {
    throw new Error(`missing artifact: ${target}`);
  }
  const content = fs.readFileSync(target, 'utf8');
  return JSON.parse(content) as T;
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('report-dir', {
      type: 'string',
      describe: 'Directory containing validator constellation artifacts',
      default: path.join(__dirname, '..', 'reports', 'latest'),
    })
    .strict()
    .help()
    .parseSync();

  const reportDir = path.resolve(argv['report-dir']);
  const summaryPath = path.join(reportDir, 'summary.json');
  const roundPath = path.join(reportDir, 'round.json');
  const jobsPath = path.join(reportDir, 'jobs.json');

  const summary = loadJson<SummaryFile>(summaryPath);
  const report = loadJson<DemoOrchestrationReport>(roundPath);
  const jobs = loadJson<JobResult[]>(jobsPath);

  const entropySources =
    summary.governance.entropy.after ?? summary.governance.entropy.before ?? {
      onChainEntropy: report.vrfWitness.sources[0],
      recentBeacon: report.vrfWitness.sources[1],
    };

  const audit = auditRound({
    report,
    jobBatch: jobs,
    governance: summary.governance.parameters,
    verifyingKey: summary.governance.zkVerifyingKey,
    truthfulVote: summary.truthfulVote,
    entropySources,
  });

  console.log('Validator Constellation Audit Result');
  console.log('====================================');
  console.log(`Scenario: ${summary.scenarioName ?? 'unknown'}`);
  console.log(`Round: ${summary.round}`);
  console.log(`Audit hash: ${audit.auditHash}`);
  console.log('Commitments verified:', audit.commitmentsVerified);
  console.log('Proof verified:', audit.proofVerified);
  console.log('Entropy verified:', audit.entropyVerified);
  console.log('Quorum satisfied:', audit.quorumSatisfied);
  console.log('Sentinel integrity:', audit.sentinelIntegrity);
  console.log('Timeline integrity:', audit.timelineIntegrity);
  console.log('Non-reveal validators:', audit.nonRevealValidators);
  console.log('Dishonest validators:', audit.dishonestValidators);
  console.log('Issues:', audit.issues);

  if (audit.issues.length > 0) {
    process.exitCode = 1;
    console.error('Audit detected issues. Inspect the logs above for details.');
  }
}

main().catch((error) => {
  console.error('Audit execution failed:', error);
  process.exit(1);
});
