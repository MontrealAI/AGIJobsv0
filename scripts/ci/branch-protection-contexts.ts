import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';

type BranchProtectionConfig =
  | boolean
  | {
      required?: boolean;
      alias?: string;
    };

type WorkflowJob = {
  name?: string;
  branch_protection?: BranchProtectionConfig;
};

type WorkflowFile = {
  name?: string;
  jobs?: Record<string, WorkflowJob | undefined>;
};

export const WORKFLOW_PATH = resolve(
  __dirname,
  '..',
  '..',
  '.github',
  'workflows',
  'ci.yml'
);

export function computeBranchProtectionContexts(): string[] {
  const fileContents = readFileSync(WORKFLOW_PATH, 'utf8');
  const parsed = load(fileContents) as WorkflowFile | undefined;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Unable to parse workflow at ${WORKFLOW_PATH}`);
  }

  const workflowName =
    typeof parsed.name === 'string' && parsed.name.trim().length > 0
      ? parsed.name.trim()
      : 'ci (v2)';
  const jobs = parsed.jobs;

  if (!jobs || typeof jobs !== 'object' || Object.keys(jobs).length === 0) {
    throw new Error('Workflow does not define any jobs to guard.');
  }

  const contexts: string[] = [];

  for (const [jobId, jobValue] of Object.entries(jobs)) {
    if (!jobValue || typeof jobValue !== 'object') {
      continue;
    }

    const jobName =
      typeof jobValue.name === 'string' && jobValue.name.trim().length > 0
        ? jobValue.name.trim()
        : jobId;

    const config = jobValue.branch_protection;

    let required = true;
    let alias = jobName;

    if (typeof config === 'boolean') {
      required = config;
    } else if (config && typeof config === 'object') {
      if (typeof config.required === 'boolean') {
        required = config.required;
      }
      if (typeof config.alias === 'string' && config.alias.trim().length > 0) {
        alias = config.alias.trim();
      }
    }

    if (!required) {
      continue;
    }

    contexts.push(`${workflowName} / ${alias}`);
  }

  if (contexts.length === 0) {
    throw new Error(
      'No branch protection contexts were derived from the workflow.'
    );
  }

  return contexts;
}

if (require.main === module) {
  const contexts = computeBranchProtectionContexts();
  for (const ctx of contexts) {
    console.log(ctx);
  }
}
