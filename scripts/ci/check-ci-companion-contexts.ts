#!/usr/bin/env ts-node

import { readCompanionContexts, listWorkflowJobsByName } from './utils/workflow';

function parseContext(context: string): { workflow: string; job: string } {
  const parts = context.split(' / ');
  if (parts.length !== 2) {
    throw new Error(
      `Invalid companion context "${context}". Expected format "workflow / job".`
    );
  }
  const [workflow, job] = parts.map((value) => value.trim());
  if (!workflow || !job) {
    throw new Error(
      `Invalid companion context "${context}". Workflow and job names must be non-empty.`
    );
  }
  return { workflow, job };
}

function main(): void {
  const contexts = readCompanionContexts();

  if (contexts.length === 0) {
    console.log('⚠️  No companion contexts defined. Nothing to verify.');
    return;
  }

  const workflowCache = new Map<string, ReturnType<typeof listWorkflowJobsByName>>();

  const missingWorkflows = new Set<string>();
  const missingJobs: string[] = [];

  for (const context of contexts) {
    const { workflow, job } = parseContext(context);

    let jobs;
    try {
      jobs = workflowCache.get(workflow) ?? listWorkflowJobsByName(workflow);
    } catch (error) {
      missingWorkflows.add(workflow);
      continue;
    }

    workflowCache.set(workflow, jobs);

    const match = jobs.find((candidate) => candidate.name === job || candidate.id === job);
    if (!match) {
      const available = jobs.map((candidate) => candidate.name).join(', ');
      missingJobs.push(
        `${context} (available jobs: ${available || 'none discovered'})`
      );
    }
  }

  if (missingWorkflows.size > 0 || missingJobs.length > 0) {
    const messages: string[] = [];
    if (missingWorkflows.size > 0) {
      messages.push(
        `Missing workflow definitions for: ${Array.from(missingWorkflows).join(', ')}`
      );
    }
    if (missingJobs.length > 0) {
      messages.push(`Missing job names for contexts: ${missingJobs.join('; ')}`);
    }
    throw new Error(messages.join(' | '));
  }

  console.log(
    `✅ Companion contexts verified (${contexts.length} entries across ${workflowCache.size} workflows).`
  );
}

main();
