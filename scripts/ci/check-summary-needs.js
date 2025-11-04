#!/usr/bin/env node

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const WORKFLOW_PATH = resolve(__dirname, '../../.github/workflows/ci.yml');

function extractJobsAndSummaryNeeds(content) {
  const lines = content.split(/\r?\n/);
  const jobIds = [];
  const summaryNeeds = [];
  let currentJob = null;
  let insideSummaryNeeds = false;
  let inJobsSection = false;

  for (const line of lines) {
    if (!inJobsSection) {
      if (/^jobs:\s*$/.test(line)) {
        inJobsSection = true;
      }
      continue;
    }

    if (/^[A-Za-z0-9_]+:\s*$/.test(line)) {
      // Reached another top-level section after jobs.
      break;
    }

    const jobMatch = line.match(/^  ([A-Za-z0-9_]+):\s*$/);
    if (jobMatch) {
      currentJob = jobMatch[1];
      jobIds.push(currentJob);
      insideSummaryNeeds = false;
      continue;
    }

    if (currentJob === 'summary') {
      if (/^ {4}needs:\s*$/.test(line)) {
        insideSummaryNeeds = true;
        summaryNeeds.length = 0;
        continue;
      }

      if (insideSummaryNeeds) {
        const needsMatch = line.match(/^ {6}- ([A-Za-z0-9_]+)\s*$/);
        if (needsMatch) {
          summaryNeeds.push(needsMatch[1]);
          continue;
        }

        if (/^ {4}\S/.test(line) || /^ {0,3}\S/.test(line)) {
          insideSummaryNeeds = false;
        }
      }
    }
  }

  return { jobIds, summaryNeeds };
}

function main() {
  const workflowRaw = readFileSync(WORKFLOW_PATH, 'utf8');
  const { jobIds, summaryNeeds } = extractJobsAndSummaryNeeds(workflowRaw);

  if (jobIds.length === 0) {
    throw new Error('No jobs discovered in ci.yml.');
  }

  if (!jobIds.includes('summary')) {
    throw new Error('ci.yml is missing the summary job.');
  }

  const expected = jobIds.filter((jobId) => jobId !== 'summary');
  const missing = expected.filter((jobId) => !summaryNeeds.includes(jobId));
  const extra = summaryNeeds.filter((jobId) => !expected.includes(jobId));

  if (missing.length > 0 || extra.length > 0) {
    const issues = [];
    if (missing.length > 0) {
      issues.push(`missing needs entries: ${missing.join(', ')}`);
    }
    if (extra.length > 0) {
      issues.push(`unexpected needs entries: ${extra.join(', ')}`);
    }
    throw new Error(
      `ci (v2) summary needs list does not match job set (${issues.join('; ')}).`
    );
  }

  if (summaryNeeds.length !== expected.length) {
    throw new Error(
      `ci (v2) summary needs ${summaryNeeds.length} jobs but ${expected.length} were discovered.`
    );
  }

  console.log(
    `✅ ci (v2) summary needs list covers ${summaryNeeds.length} jobs (all non-summary jobs).`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(1);
  }
}
