import { DeterministicRandom } from './random';
import { Job, JobDistributionConfig, JobTheme } from './types';

export function generateJobs(config: JobDistributionConfig, rng: DeterministicRandom, overrideCount?: number): Job[] {
  const jobs: Job[] = [];
  const count = overrideCount ?? config.count;
  for (let i = 0; i < count; i += 1) {
    const value = rng.nextBetween(config.valueRange[0], config.valueRange[1]);
    const complexity = rng.nextBetween(config.complexityRange[0], config.complexityRange[1]);
    const deadline = rng.nextBetween(config.deadlineRange[0], config.deadlineRange[1]);
    const enterprise = rng.next() < config.enterpriseMix;
    const critical = rng.next() < config.criticalMass;
    const theme = pickTheme(rng);
    jobs.push({
      id: `JOB-${i + 1}`,
      value,
      complexity,
      deadlineHours: deadline,
      enterprise,
      critical,
      theme
    });
  }
  return jobs;
}

function pickTheme(rng: DeterministicRandom): JobTheme {
  const roll = rng.next();
  if (roll < 0.34) {
    return 'innovation';
  }
  if (roll < 0.68) {
    return 'compliance';
  }
  return 'velocity';
}
