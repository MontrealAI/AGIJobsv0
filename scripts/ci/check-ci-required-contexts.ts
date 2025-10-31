#!/usr/bin/env ts-node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import yaml from 'js-yaml';

const WORKFLOW_PATH = resolve(__dirname, '../../.github/workflows/ci.yml');
const BRANCH_GUARD_PATH = resolve(__dirname, 'verify-branch-protection.ts');

function parseExpectedContexts(): string[] {
  const source = readFileSync(BRANCH_GUARD_PATH, 'utf8');
  const match = source.match(/const\s+EXPECTED_CONTEXTS\s*=\s*\[(.*?)\]\s*as\s+const/su);
  if (!match) {
    throw new Error('Unable to locate EXPECTED_CONTEXTS definition in verify-branch-protection.ts');
  }

  const rawEntries = match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'))
    .map((line) => line.replace(/[,\s]*$/u, ''))
    .map((line) => line.replace(/^['"]/u, '').replace(/['"]$/u, ''))
    .filter((line) => line.length > 0);

  const invalid = rawEntries.filter((entry) => !entry.startsWith('ci (v2) / '));
  if (invalid.length > 0) {
    throw new Error(
      `Expected every context to begin with "ci (v2) / ". Offending entries: ${invalid.join(', ')}`
    );
  }

  return rawEntries;
}

function parseWorkflowJobNames(): Map<string, string> {
  const workflow = yaml.load(readFileSync(WORKFLOW_PATH, 'utf8')) as {
    jobs?: Record<string, { name?: unknown }>;
  };

  if (!workflow || typeof workflow !== 'object' || !('jobs' in workflow)) {
    throw new Error('Unable to parse jobs from ci.yml');
  }

  const jobMap = new Map<string, string>();
  for (const [jobId, jobConfig] of Object.entries(workflow.jobs ?? {})) {
    if (!jobConfig || typeof jobConfig !== 'object') {
      continue;
    }
    const jobNameRaw = 'name' in jobConfig ? jobConfig.name : undefined;
    const jobName = typeof jobNameRaw === 'string' && jobNameRaw.trim().length > 0 ? jobNameRaw.trim() : jobId;
    jobMap.set(jobName, jobId);
  }

  if (jobMap.size === 0) {
    throw new Error('No jobs discovered in ci.yml; workflow parsing likely failed');
  }

  return jobMap;
}

function main(): void {
  const contexts = parseExpectedContexts();
  const workflowJobs = parseWorkflowJobNames();

  const contextJobNames = contexts.map((entry) => entry.replace(/^ci \(v2\) \/ /u, ''));

  const missingJobNames = contextJobNames.filter((name) => !workflowJobs.has(name));
  if (missingJobNames.length > 0) {
    const suggestions = missingJobNames
      .map((name) => {
        const similar = Array.from(workflowJobs.keys()).find(
          (jobName) => jobName.toLowerCase() === name.toLowerCase()
        );
        return similar ? `${name} (did you mean ${similar}?)` : name;
      })
      .join(', ');
    throw new Error(
      `Expected workflow jobs with display names matching branch protection contexts. Missing: ${suggestions}`
    );
  }

  const missingContexts = Array.from(workflowJobs.keys()).filter(
    (name) => !contextJobNames.includes(name)
  );
  if (missingContexts.length > 0) {
    throw new Error(
      `Workflow defines job names that are not enforced via branch protection contexts: ${missingContexts.join(', ')}`
    );
  }

  const duplicates = new Set<string>();
  const seen = new Set<string>();
  for (const context of contexts) {
    if (seen.has(context)) {
      duplicates.add(context);
    }
    seen.add(context);
  }

  if (duplicates.size > 0) {
    throw new Error(`Duplicate contexts detected: ${Array.from(duplicates).join(', ')}`);
  }

  console.log('✅ Branch protection contexts align with ci.yml job display names.');
  console.log(`• Checked ${contexts.length} contexts against ${workflowJobs.size} workflow jobs.`);
}

main();
