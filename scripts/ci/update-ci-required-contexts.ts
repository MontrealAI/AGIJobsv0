#!/usr/bin/env ts-node

import { writeFileSync } from 'node:fs';

import {
  CI_REQUIRED_CONTEXTS_PATH,
  CI_REQUIRED_CONTEXT_PREFIX,
  listCiWorkflowJobs,
  readRequiredContexts,
} from './utils/workflow';

function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

function toContextNames(jobNames: string[]): string[] {
  const contexts = jobNames.map((name) => `${CI_REQUIRED_CONTEXT_PREFIX}${name}`);
  const duplicates = new Set<string>();
  const seen = new Set<string>();

  for (const context of contexts) {
    if (seen.has(context)) {
      duplicates.add(context);
    }
    seen.add(context);
  }

  if (duplicates.size > 0) {
    throw new Error(
      `ci.yml produced duplicate contexts: ${Array.from(duplicates).join(', ')}`
    );
  }

  return contexts;
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  const shouldCheck = args.has('--check');

  const jobNames = listCiWorkflowJobs().map((job) => job.name);
  const desiredContexts = toContextNames(jobNames);

  let existing: string[] = [];
  let existingError: Error | null = null;
  try {
    existing = readRequiredContexts();
  } catch (error) {
    existingError = error as Error;
  }

  if (shouldCheck) {
    if (existingError) {
      throw new Error(
        `ci/required-contexts.json could not be read: ${existingError.message}`
      );
    }

    const desiredSet = new Set(desiredContexts);
    const existingSet = new Set(existing);

    const missing = desiredContexts.filter((context) => !existingSet.has(context));
    const extra = existing.filter((context) => !desiredSet.has(context));
    const orderMatches = arraysEqual(existing, desiredContexts);

    if (missing.length === 0 && extra.length === 0 && orderMatches) {
      console.log(
        `✅ ci/required-contexts.json is in sync with ci.yml (${desiredContexts.length} contexts).`
      );
      return;
    }

    const issues: string[] = [];
    if (missing.length > 0) {
      issues.push(`missing contexts: ${missing.join(', ')}`);
    }
    if (extra.length > 0) {
      issues.push(`unexpected contexts: ${extra.join(', ')}`);
    }
    if (!orderMatches) {
      issues.push('context order mismatch');
    }

    throw new Error(`ci/required-contexts.json is out of sync (${issues.join('; ')}).`);
  }

  writeFileSync(
    CI_REQUIRED_CONTEXTS_PATH,
    JSON.stringify(desiredContexts, null, 2) + '\n',
    'utf8'
  );

  console.log(
    `📝 Updated ci/required-contexts.json with ${desiredContexts.length} contexts to match ci.yml.`
  );
}

main();
