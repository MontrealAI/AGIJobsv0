#!/usr/bin/env ts-node

import { readFileSync } from 'node:fs';
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

export const CI_REQUIRED_CONTEXT_PREFIX = 'ci (v2) / ';

export interface CiWorkflowJob {
  id: string;
  name: string;
}

interface WorkflowFile {
  jobs?: Record<string, { name?: unknown }>;
}

export function listCiWorkflowJobs(): CiWorkflowJob[] {
  let workflowRaw: string;

  try {
    workflowRaw = readFileSync(CI_WORKFLOW_PATH, 'utf8');
  } catch (error) {
    throw new Error(
      `Unable to read ci workflow at ${CI_WORKFLOW_PATH}: ${(error as Error).message}`
    );
  }

  const parsed = yaml.load(workflowRaw) as WorkflowFile | undefined;

  if (!parsed || typeof parsed !== 'object' || !('jobs' in parsed)) {
    throw new Error('ci.yml is missing a jobs definition.');
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
    throw new Error('No jobs discovered in ci.yml.');
  }

  return results;
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

export function stripContextPrefix(context: string): string {
  return context.startsWith(CI_REQUIRED_CONTEXT_PREFIX)
    ? context.slice(CI_REQUIRED_CONTEXT_PREFIX.length)
    : context;
}
