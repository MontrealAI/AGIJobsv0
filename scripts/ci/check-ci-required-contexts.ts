#!/usr/bin/env ts-node

import {
  CI_REQUIRED_CONTEXT_PREFIX,
  listCiWorkflowJobs,
  readRequiredContexts,
  stripContextPrefix,
} from './utils/workflow';

function main(): void {
  const contexts = readRequiredContexts();
  const workflowJobs = listCiWorkflowJobs();

  const jobNameToId = new Map<string, string>();
  const duplicateWorkflowNames = new Set<string>();
  for (const { id, name } of workflowJobs) {
    if (jobNameToId.has(name)) {
      duplicateWorkflowNames.add(name);
      continue;
    }
    jobNameToId.set(name, id);
  }

  if (duplicateWorkflowNames.size > 0) {
    throw new Error(
      `ci.yml defines duplicate job display names: ${Array.from(duplicateWorkflowNames).join(', ')}`
    );
  }

  const contextJobNames = contexts.map((entry) => stripContextPrefix(entry));

  const missingJobNames = contextJobNames.filter((name) => !jobNameToId.has(name));
  if (missingJobNames.length > 0) {
    const suggestions = missingJobNames
      .map((name) => {
        const similar = workflowJobs.find(
          (job) => job.name.toLowerCase() === name.toLowerCase()
        );
        return similar ? `${name} (did you mean ${similar.name}?)` : name;
      })
      .join(', ');
    throw new Error(
      `Expected workflow jobs with display names matching branch protection contexts. Missing: ${suggestions}`
    );
  }

  const missingContexts = workflowJobs
    .map((job) => job.name)
    .filter((name) => !contextJobNames.includes(name));
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
  console.log(
    `• Checked ${contexts.length} contexts against ${workflowJobs.length} workflow jobs with prefix "${CI_REQUIRED_CONTEXT_PREFIX}".`
  );
}

main();
