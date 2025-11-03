#!/usr/bin/env ts-node

import {
  readCompanionContexts,
  readRequiredContexts,
  stripContextPrefix,
} from './utils/workflow';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';

type WorkflowRun = {
  id: number;
  name: string;
  status: string | null;
  conclusion: string | null;
  head_branch: string;
  html_url?: string;
};

type WorkflowRunsResponse = {
  workflow_runs: WorkflowRun[];
};

type WorkflowJob = {
  name: string;
  status: string | null;
  conclusion: string | null;
  html_url?: string;
};

type WorkflowJobsResponse = {
  jobs: WorkflowJob[];
  total_count: number;
};

interface CliArguments {
  owner: string;
  repo: string;
  branch: string;
  workflow: string;
  token?: string;
  requireSuccess: boolean;
  includeCompanion: boolean;
}

interface WorkflowVerificationDescriptor {
  workflow: string;
  label: string;
  jobNames: string[];
}

interface VerificationOutput {
  summary: string[];
  runUrl?: string;
}

async function githubJson<T>(url: string, token: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'agijobsv0-ci-status-wall',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to reach GitHub API for ${url}: ${reason}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `GitHub API request failed (${response.status} ${response.statusText}) for ${url}: ${detail}`
    );
  }

  return (await response.json()) as T;
}

function buildRunsUrl(
  owner: string,
  repo: string,
  workflow: string,
  branch: string,
  requireSuccess: boolean
): string {
  const params = new URLSearchParams({
    branch,
    per_page: '1',
    status: requireSuccess ? 'success' : 'completed',
  });
  return `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/runs?${params.toString()}`;
}

function buildJobsUrl(
  owner: string,
  repo: string,
  runId: number
): string {
  const params = new URLSearchParams({
    per_page: '100',
  });
  return `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs?${params.toString()}`;
}

function normaliseConclusion(job: WorkflowJob): string {
  const conclusion = (job.conclusion ?? job.status ?? 'unknown').toLowerCase();
  if (conclusion === 'success' || conclusion === 'skipped') {
    return conclusion;
  }
  return conclusion.length > 0 ? conclusion : 'unknown';
}

async function verifyWorkflow(
  descriptor: WorkflowVerificationDescriptor,
  argv: CliArguments,
  token: string
): Promise<VerificationOutput> {
  const runsUrl = buildRunsUrl(
    argv.owner,
    argv.repo,
    descriptor.workflow,
    argv.branch,
    argv.requireSuccess
  );
  const runResponse = await githubJson<WorkflowRunsResponse>(runsUrl, token);

  if (
    !Array.isArray(runResponse.workflow_runs) ||
    runResponse.workflow_runs.length === 0
  ) {
    throw new Error(
      `No workflow runs found for ${descriptor.workflow} on branch ${argv.branch}.`
    );
  }

  const run = runResponse.workflow_runs[0];

  if (argv.requireSuccess && run.conclusion !== 'success') {
    throw new Error(
      `Latest successful run for ${descriptor.workflow} not found; most recent run concluded with ${run.conclusion ?? 'unknown'} (${run.status ?? 'unknown'}).`
    );
  }

  const jobsUrl = buildJobsUrl(argv.owner, argv.repo, run.id);
  const jobsResponse = await githubJson<WorkflowJobsResponse>(jobsUrl, token);
  const jobs = jobsResponse.jobs ?? [];

  if (jobs.length === 0) {
    throw new Error(
      `No jobs returned for run ${run.id} (${descriptor.workflow}). Ensure workflow permissions allow job enumeration.`
    );
  }

  const failures: string[] = [];
  const missing: string[] = [];

  for (const jobName of descriptor.jobNames) {
    const job = jobs.find((entry) => entry.name === jobName);
    if (!job) {
      missing.push(jobName);
      continue;
    }

    const conclusion = normaliseConclusion(job);
    if (conclusion !== 'success' && conclusion !== 'skipped') {
      const detail = job.conclusion ?? job.status ?? 'unknown';
      failures.push(`${jobName} → ${detail}`);
    }
  }

  if (missing.length > 0 || failures.length > 0) {
    const lines = [`CI status wall verification failed for ${descriptor.label}.`];
    if (missing.length > 0) {
      lines.push(`Missing jobs: ${missing.join(', ')}`);
    }
    if (failures.length > 0) {
      lines.push(`Failed jobs: ${failures.join(', ')}`);
    }
    if (run.html_url) {
      lines.push(`Inspect run: ${run.html_url}`);
    }
    throw new Error(lines.join('\n'));
  }

  const summary = descriptor.jobNames.map((jobName) => {
    const job = jobs.find((entry) => entry.name === jobName);
    const conclusion = job ? normaliseConclusion(job) : 'missing';
    const marker = conclusion === 'success' ? '✅' : '⚠️';
    const link = job?.html_url ?? run.html_url ?? 'n/a';
    return `${marker} ${descriptor.label} → ${jobName} — ${conclusion.toUpperCase()} (${link})`;
  });

  return { summary, runUrl: run.html_url };
}

function groupCompanionContexts(contexts: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const context of contexts) {
    const [workflow, jobName] = context.split(' / ', 2).map((entry) => entry.trim());
    if (!workflow || !jobName) {
      throw new Error(
        `Invalid companion context "${context}". Expected format "workflow / job".`
      );
    }
    const workflowFile = workflow.endsWith('.yml') || workflow.endsWith('.yaml')
      ? workflow
      : `${workflow}.yml`;
    const existing = grouped.get(workflowFile) ?? [];
    existing.push(jobName);
    grouped.set(workflowFile, existing);
  }

  return grouped;
}

async function main(): Promise<void> {
  const argv = yargs(hideBin(process.argv))
    .option('owner', {
      type: 'string',
      default: 'MontrealAI',
      describe: 'GitHub organisation or user',
    })
    .option('repo', {
      type: 'string',
      default: 'AGIJobsv0',
      describe: 'Repository name',
    })
    .option('branch', {
      type: 'string',
      default: 'main',
      describe: 'Branch to inspect for the workflow',
    })
    .option('workflow', {
      type: 'string',
      default: 'ci.yml',
      describe: 'Workflow file name or ID to use for ci (v2) verification',
    })
    .option('token', {
      type: 'string',
      describe:
        'GitHub token. Falls back to GITHUB_TOKEN or GH_TOKEN environment variables when omitted.',
    })
    .option('require-success', {
      type: 'boolean',
      default: true,
      describe: 'Require the selected workflow runs to have succeeded',
    })
    .option('include-companion', {
      type: 'boolean',
      default: false,
      describe:
        'Verify companion workflow contexts in addition to the primary ci (v2) manifest.',
    })
    .help()
    .alias('help', 'h')
    .parseSync() as CliArguments;

  const token =
    argv.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';

  if (!token) {
    throw new Error(
      'A GitHub token is required. Provide one via --token, GITHUB_TOKEN, or GH_TOKEN.'
    );
  }

  const primaryContexts = readRequiredContexts();
  const ciJobNames = primaryContexts.map((context) => stripContextPrefix(context));
  const descriptors: WorkflowVerificationDescriptor[] = [
    {
      workflow: argv.workflow,
      label: 'ci (v2)',
      jobNames: ciJobNames,
    },
  ];

  if (argv.includeCompanion) {
    const companionContexts = readCompanionContexts();
    const grouped = groupCompanionContexts(companionContexts);
    for (const [workflow, jobNames] of grouped.entries()) {
      descriptors.push({
        workflow,
        label: workflow.replace(/\.ya?ml$/, ''),
        jobNames,
      });
    }
  }

  const overallSummary: string[] = [];

  for (const descriptor of descriptors) {
    const output = await verifyWorkflow(descriptor, argv, token);
    overallSummary.push(...output.summary);
    if (output.runUrl) {
      console.log(
        `Verified ${descriptor.label} via run ${output.runUrl ?? 'unknown run URL'}.`
      );
    }
  }

  console.log('CI status wall verified. Context breakdown:');
  console.log(overallSummary.join('\n'));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
