#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const WORKFLOW_RELATIVE_PATH = path.join('..', '..', '.github', 'workflows', 'ci.yml');

function loadWorkflowContents() {
  const workflowPath = path.join(__dirname, WORKFLOW_RELATIVE_PATH);
  return fs.readFileSync(workflowPath, 'utf8');
}

function extractWorkflowName(contents) {
  const match = contents.match(/^name:\s*(.+)$/m);
  if (!match) {
    throw new Error('Unable to locate workflow name in ci.yml');
  }
  return match[1].trim();
}

function normalizeValue(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseJobs(contents) {
  const lines = contents.split(/\r?\n/);
  const jobs = [];
  let inJobsSection = false;
  let currentJob = null;
  let collectingNeeds = false;
  let needsIndent = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    const trimmed = line.trim();

    if (!inJobsSection) {
      if (trimmed === 'jobs:') {
        inJobsSection = true;
      }
      continue;
    }

    if (indent === 0 && trimmed && trimmed !== 'jobs:') {
      if (currentJob) {
        jobs.push(currentJob);
      }
      break;
    }

    if (collectingNeeds) {
      if (!trimmed) {
        continue;
      }
      if (indent <= needsIndent || !trimmed.startsWith('- ')) {
        collectingNeeds = false;
        // Re-process the current line outside of the needs block.
        index -= 1;
        continue;
      }
      const need = normalizeValue(trimmed.slice(2));
      if (need) {
        currentJob.needs.push(need);
      }
      continue;
    }

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const jobMatch = line.match(/^\s{2}([A-Za-z0-9_-]+):/);
    if (jobMatch) {
      if (currentJob) {
        jobs.push(currentJob);
      }
      currentJob = {
        id: jobMatch[1],
        name: '',
        needs: [],
        ifCondition: '',
      };
      continue;
    }

    if (!currentJob) {
      continue;
    }

    const nameMatch = line.match(/^\s{4}name:\s*(.+)$/);
    if (nameMatch) {
      currentJob.name = normalizeValue(nameMatch[1]);
      continue;
    }

    const ifMatch = line.match(/^\s{4}if:\s*(.+)$/);
    if (ifMatch) {
      currentJob.ifCondition = ifMatch[1].trim();
      continue;
    }

    const needsMatch = line.match(/^\s{4}needs:\s*(.*)$/);
    if (needsMatch) {
      const inlineValue = normalizeValue(needsMatch[1]);
      if (inlineValue) {
        inlineValue
          .replace(/[\[\]]/g, '')
          .split(',')
          .map((part) => normalizeValue(part))
          .filter(Boolean)
          .forEach((value) => currentJob.needs.push(value));
      } else {
        collectingNeeds = true;
        needsIndent = indent;
      }
      continue;
    }
  }

  if (currentJob) {
    jobs.push(currentJob);
  }

  return jobs;
}

function formatContexts(workflowName, jobs) {
  return jobs
    .filter((job) => job.name)
    .map((job) => ({
      id: job.id,
      name: job.name,
      context: `${workflowName} / ${job.name}`,
      needs: job.needs.slice(),
      ifCondition: job.ifCondition,
    }));
}

function validateSummary(summaryJob, requiredUpstream) {
  if (!summaryJob) {
    throw new Error('Summary job not found in ci.yml');
  }
  const missing = requiredUpstream.filter((jobId) => !summaryJob.needs.includes(jobId));
  if (missing.length > 0) {
    throw new Error(
      `Summary job is missing required dependencies: ${missing.join(', ')}`
    );
  }
  if (!summaryJob.ifCondition.includes('always()')) {
    throw new Error('Summary job must run with if: ${{ always() }}');
  }
}

function validateAlwaysGuards(jobs, jobIds) {
  for (const jobId of jobIds) {
    const job = jobs.find((entry) => entry.id === jobId);
    if (!job) {
      throw new Error(`Expected job "${jobId}" not found in ci.yml`);
    }
    if (!job.ifCondition.includes('always()')) {
      throw new Error(
        `Job "${jobId}" must include an if guard with always(), found: ${job.ifCondition || '∅'}`
      );
    }
  }
}

function validateDependencies(jobs, dependencyPairs) {
  for (const [jobId, expectedNeeds] of dependencyPairs) {
    const job = jobs.find((entry) => entry.id === jobId);
    if (!job) {
      throw new Error(`Expected job "${jobId}" not found in ci.yml`);
    }
    for (const expected of expectedNeeds) {
      if (!job.needs.includes(expected)) {
        throw new Error(
          `Job "${jobId}" must depend on "${expected}" but the dependency was not found.`
        );
      }
    }
  }
}

function printHumanReadable(workflowName, contexts) {
  console.log(`${workflowName} required status contexts`);
  console.log('='.repeat(workflowName.length + 28));
  for (const context of contexts) {
    console.log(`- ${context.context}`);
  }
  const summary = contexts.find((entry) => entry.id === 'summary');
  if (summary) {
    console.log('\nSummary gate dependencies:');
    for (const need of summary.needs) {
      console.log(`  • ${need}`);
    }
  }
}

function main() {
  try {
    const args = new Set(process.argv.slice(2));
    const asJson = args.has('--json');
    const contents = loadWorkflowContents();
    const workflowName = extractWorkflowName(contents);
    const jobs = parseJobs(contents);
    const contexts = formatContexts(workflowName, jobs);

    validateSummary(
      contexts.find((job) => job.id === 'summary'),
      ['lint', 'tests', 'foundry', 'coverage']
    );
    validateAlwaysGuards(jobs, ['foundry', 'coverage', 'summary']);
    validateDependencies(jobs, [
      ['foundry', ['tests']],
      ['coverage', ['tests']],
    ]);

    if (asJson) {
      console.log(JSON.stringify(contexts, null, 2));
    } else {
      printHumanReadable(workflowName, contexts);
    }
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

main();
