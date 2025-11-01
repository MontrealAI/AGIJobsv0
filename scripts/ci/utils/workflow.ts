#!/usr/bin/env ts-node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import yaml from 'js-yaml';

export const CI_WORKFLOW_PATH = resolve(
  __dirname,
  '../../../.github/workflows/ci.yml'
);

export const CI_REQUIRED_CONTEXTS_PATH = resolve(
  __dirname,
  '../../../ci/required-contexts.json'
);

export const CI_REQUIRED_COMPANION_CONTEXTS_PATH = resolve(
  __dirname,
  '../../../ci/required-companion-contexts.json'
);

export const CI_REQUIRED_CONTEXT_PREFIX = 'ci (v2) / ';

export interface CiWorkflowJob {
  id: string;
  name: string;
}

interface WorkflowFile {
  jobs?: Record<string, { name?: unknown }>;
}

function listWorkflowJobsFromPath(workflowPath: string): CiWorkflowJob[] {
  let workflowRaw: string;

  try {
    workflowRaw = readFileSync(workflowPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Unable to read workflow at ${workflowPath}: ${(error as Error).message}`
    );
  }

  const parsed = yaml.load(workflowRaw) as WorkflowFile | undefined;

  if (!parsed || typeof parsed !== 'object' || !('jobs' in parsed)) {
    throw new Error(`${workflowPath} is missing a jobs definition.`);
  }

  const jobs = parsed.jobs ?? {};
  const results: CiWorkflowJob[] = [];

  for (const [jobId, jobConfig] of Object.entries(jobs)) {
    const rawName =
      jobConfig && typeof jobConfig === 'object' && 'name' in jobConfig
        ? jobConfig.name
        : undefined;
    const name =
      typeof rawName === 'string' && rawName.trim().length > 0
        ? rawName.trim()
        : jobId;
    results.push({ id: jobId, name });
  }

  if (results.length === 0) {
    throw new Error(`No jobs discovered in workflow ${workflowPath}.`);
  }

  return results;
}

export function listCiWorkflowJobs(): CiWorkflowJob[] {
  return listWorkflowJobsFromPath(CI_WORKFLOW_PATH);
}

export function listWorkflowJobsByName(workflowName: string): CiWorkflowJob[] {
  const workflowsDir = resolve(__dirname, '../../../.github/workflows');
  const candidates = [
    resolve(workflowsDir, `${workflowName}.yml`),
    resolve(workflowsDir, `${workflowName}.yaml`),
  ];

  const existingPath = candidates.find((candidate) => existsSync(candidate));

  if (!existingPath) {
    throw new Error(
      `Unable to locate workflow definition for ${workflowName}. Expected one of: ${candidates.join(', ')}`
    );
  }

  return listWorkflowJobsFromPath(existingPath);
}

export function readRequiredContexts(): string[] {
  let raw: string;

  try {
    raw = readFileSync(CI_REQUIRED_CONTEXTS_PATH, 'utf8');
  } catch (error) {
    throw new Error(
      `Unable to read required contexts at ${CI_REQUIRED_CONTEXTS_PATH}: ${(error as Error).message}`
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `ci/required-contexts.json is not valid JSON: ${(error as Error).message}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error('ci/required-contexts.json must contain an array of strings.');
  }

  return parsed.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(
        `ci/required-contexts.json entry at index ${index} is not a string.`
      );
    }

    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      throw new Error(
        `ci/required-contexts.json entry at index ${index} must not be empty.`
      );
    }

    if (!trimmed.startsWith(CI_REQUIRED_CONTEXT_PREFIX)) {
      throw new Error(
        `ci/required-contexts.json entry "${trimmed}" must start with "${CI_REQUIRED_CONTEXT_PREFIX}".`
      );
    }

    return trimmed;
  });
}

export function readCompanionContexts(): string[] {
  if (!existsSync(CI_REQUIRED_COMPANION_CONTEXTS_PATH)) {
    return [];
  }

  let raw: string;
  try {
    raw = readFileSync(CI_REQUIRED_COMPANION_CONTEXTS_PATH, 'utf8');
  } catch (error) {
    throw new Error(
      `Unable to read companion contexts at ${CI_REQUIRED_COMPANION_CONTEXTS_PATH}: ${(error as Error).message}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `ci/required-companion-contexts.json is not valid JSON: ${(error as Error).message}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      'ci/required-companion-contexts.json must contain an array of strings.'
    );
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const contexts = parsed.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(
        `ci/required-companion-contexts.json entry at index ${index} is not a string.`
      );
    }

    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      throw new Error(
        `ci/required-companion-contexts.json entry at index ${index} must not be empty.`
      );
    }

    if (!trimmed.includes(' / ')) {
      throw new Error(
        `Companion context "${trimmed}" must include a workflow and job name separated by " / ".`
      );
    }

    if (seen.has(trimmed)) {
      duplicates.add(trimmed);
    }

    seen.add(trimmed);
    return trimmed;
  });

  if (duplicates.size > 0) {
    throw new Error(
      `Duplicate companion contexts detected: ${Array.from(duplicates).join(', ')}`
    );
  }

  return contexts;
}

export function readAllRequiredContexts(): string[] {
  const primary = readRequiredContexts();
  const companion = readCompanionContexts();

  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const context of [...primary, ...companion]) {
    if (seen.has(context)) {
      duplicates.add(context);
    }
    seen.add(context);
  }

  if (duplicates.size > 0) {
    throw new Error(
      `Duplicate contexts detected across required context manifests: ${Array.from(duplicates).join(', ')}`
    );
  }

  return [...primary, ...companion];
}

export function stripContextPrefix(context: string): string {
  return context.startsWith(CI_REQUIRED_CONTEXT_PREFIX)
    ? context.slice(CI_REQUIRED_CONTEXT_PREFIX.length)
    : context;
}
