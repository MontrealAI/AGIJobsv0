import fs from 'node:fs';
import path from 'node:path';

import yaml from 'js-yaml';

import { DEFAULT_CONFIG, type AlphaNodeConfig } from '../../config/defaults.js';
import { createLogger } from './telemetry.js';

const logger = createLogger('config-loader');

type ConfigInput = Partial<AlphaNodeConfig> & Record<string, unknown>;

function mergeDeep<T extends Record<string, unknown>>(target: T, source: ConfigInput): T {
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const targetValue = (target as Record<string, unknown>)[key] ?? {};
      (target as Record<string, unknown>)[key] = mergeDeep(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as unknown as T[keyof T];
    } else if (sourceValue !== undefined) {
      (target as Record<string, unknown>)[key] = sourceValue;
    }
  }
  return target;
}

export function loadConfig(): AlphaNodeConfig {
  let result: AlphaNodeConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  const configLocations = [
    path.join(process.cwd(), 'alpha-node.config.yml'),
    path.join(process.cwd(), 'alpha-node.config.yaml'),
    path.join(process.cwd(), 'alpha-node.config.json')
  ];

  for (const location of configLocations) {
    if (!fs.existsSync(location)) {
      continue;
    }
    logger.info({ location }, 'Loading configuration override');
    const raw = fs.readFileSync(location, 'utf-8');
    const extension = path.extname(location).toLowerCase();
    let parsed: ConfigInput;
    if (extension === '.yml' || extension === '.yaml') {
      parsed = yaml.load(raw) as ConfigInput;
    } else {
      parsed = JSON.parse(raw) as ConfigInput;
    }
    result = mergeDeep(result as unknown as Record<string, unknown>, parsed) as AlphaNodeConfig;
  }

  if (process.env.ALPHA_NODE_MIN_STAKE) {
    result.staking.minimumStake = process.env.ALPHA_NODE_MIN_STAKE;
  }
  if (process.env.ALPHA_NODE_MAX_CONCURRENT) {
    result.jobs.maxConcurrent = Number.parseInt(process.env.ALPHA_NODE_MAX_CONCURRENT, 10);
  }

  return result;
}
