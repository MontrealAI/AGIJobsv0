#!/usr/bin/env ts-node

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Args {
  owner?: string;
  repo?: string;
  branch: string;
  token?: string;
  dryRun: boolean;
}

interface GraphQlError {
  message: string;
}

interface GraphQlResponse<T> {
  data?: T;
  errors?: GraphQlError[];
}

interface BranchProtectionRule {
  id: string;
  pattern: string;
  requiredStatusCheckContexts?: string[] | null;
  requiresStatusChecks: boolean;
  requiresStrictStatusChecks: boolean;
  isAdminEnforced: boolean;
  matchingRefs?: {
    nodes?: Array<{ name?: string | null }> | null;
  } | null;
}

interface BranchProtectionQueryData {
  repository: {
    id: string;
    branchProtectionRules: {
      nodes: BranchProtectionRule[];
    };
  } | null;
}

interface BranchProtectionMutationData {
  updateBranchProtectionRule?: {
    branchProtectionRule?: BranchProtectionRule | null;
  } | null;
  createBranchProtectionRule?: {
    branchProtectionRule?: BranchProtectionRule | null;
  } | null;
}

const CONTEXTS_PATH = resolve(__dirname, '../../ci/required-contexts.json');

function loadExpectedContexts(): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(CONTEXTS_PATH, 'utf8'));
  } catch (error) {
    throw new Error(
      `Unable to read ci/required-contexts.json: ${(error as Error).message}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      'ci/required-contexts.json must contain an array of strings.'
    );
  }

  const contexts = parsed.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(
        `ci/required-contexts.json entry at index ${index} is not a string.`
      );
    }
    const trimmed = entry.trim();
    if (!trimmed) {
      throw new Error(
        `ci/required-contexts.json entry at index ${index} must not be empty.`
      );
    }
    if (!trimmed.startsWith('ci (v2) / ')) {
      throw new Error(
        `ci/required-contexts.json entry "${trimmed}" must start with "ci (v2) / ".`
      );
    }
    return trimmed;
  });

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const context of contexts) {
    if (seen.has(context)) {
      duplicates.add(context);
    }
    seen.add(context);
  }

  if (duplicates.size > 0) {
    throw new Error(
      `Duplicate contexts detected: ${Array.from(duplicates).join(', ')}`
    );
  }

  if (contexts.length === 0) {
    throw new Error(
      'ci/required-contexts.json does not define any required contexts.'
    );
  }

  return contexts;
}

function parseArgs(): Args {
  const args: Args = { branch: 'main', dryRun: false };
  const [, , ...argv] = process.argv;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--owner':
        if (!next) {
          throw new Error('--owner requires a value');
        }
        args.owner = next;
        i += 1;
        break;
      case '--repo':
        if (!next) {
          throw new Error('--repo requires a value');
        }
        args.repo = next;
        i += 1;
        break;
      case '--branch':
        if (!next) {
          throw new Error('--branch requires a value');
        }
        args.branch = next;
        i += 1;
        break;
      case '--token':
        if (!next) {
          throw new Error('--token requires a value');
        }
        args.token = next;
        i += 1;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option ${arg}`);
        }
        break;
    }
  }

  return args;
}

function printUsage(): void {
  console.log(
    'Usage: ts-node scripts/ci/enforce-branch-protection.ts [--owner <org>] [--repo <name>] [--branch <branch>] [--token <token>] [--dry-run]\n\n' +
      'Defaults:\n  --branch main\n  --owner/--repo derived from $GITHUB_REPOSITORY or git remote origin\n  --token reads $GITHUB_TOKEN, $GH_TOKEN, or $PAT\n'
  );
}

function deriveOwnerRepo(
  explicitOwner?: string,
  explicitRepo?: string
): { owner: string; repo: string } {
  if (explicitOwner && explicitRepo) {
    return { owner: explicitOwner, repo: explicitRepo };
  }

  const envRepo = process.env.GITHUB_REPOSITORY;
  if (envRepo) {
    const [owner, repo] = envRepo.split('/');
    if (owner && repo) {
      return { owner, repo };
    }
  }

  try {
    const remoteUrl = execSync('git config --get remote.origin.url', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (remoteUrl) {
      const match = /[:/]([^/]+)\/(.+?)\.git$/u.exec(remoteUrl);
      if (match) {
        return { owner: match[1], repo: match[2] };
      }
    }
  } catch (error) {
    console.warn(
      'Warning: unable to derive owner/repo from git remote.',
      error
    );
  }

  throw new Error(
    'Unable to determine repository owner/name. Provide --owner and --repo explicitly or set GITHUB_REPOSITORY.'
  );
}

function resolveToken(explicitToken?: string): string {
  const token =
    explicitToken ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.PAT;
  if (!token) {
    throw new Error(
      'Missing GitHub token. Provide --token or set GITHUB_TOKEN/GH_TOKEN/PAT.'
    );
  }
  return token;
}

async function graphqlRequest<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'agijobs-branch-protection-enforcer',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub GraphQL request failed with ${response.status} ${response.statusText}: ${body}`
    );
  }

  const payload = (await response.json()) as GraphQlResponse<T>;
  if (payload.errors && payload.errors.length > 0) {
    const message = payload.errors.map((error) => error.message).join('; ');
    throw new Error(`GitHub GraphQL error: ${message}`);
  }

  if (!payload.data) {
    throw new Error('GitHub GraphQL response did not include data.');
  }

  return payload.data;
}

function normalisePattern(pattern: string): string {
  return pattern.replace(/^refs\/heads\//u, '');
}

function matchesBranch(rule: BranchProtectionRule, branch: string): boolean {
  const pattern = normalisePattern(rule.pattern);
  if (pattern === branch) {
    return true;
  }

  if (rule.matchingRefs?.nodes?.some((node) => node?.name === branch)) {
    return true;
  }

  if (pattern.includes('*')) {
    const regex = new RegExp(
      `^${pattern
        .split('*')
        .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
        .join('.*')}$`
    );
    return regex.test(branch);
  }

  return false;
}

function findProtectionRule(
  rules: BranchProtectionRule[],
  branch: string
): BranchProtectionRule | undefined {
  const matchingRules = rules.filter((rule) => matchesBranch(rule, branch));

  const scoredRules = matchingRules.map((rule) => {
    const pattern = normalisePattern(rule.pattern);
    const matchesRef = rule.matchingRefs?.nodes?.some(
      (node) => node?.name === branch
    );
    const isExactMatch = pattern === branch || matchesRef;

    return {
      rule,
      isExactMatch,
      patternLength: pattern.length,
    };
  });

  scoredRules.sort((left, right) => {
    if (left.isExactMatch !== right.isExactMatch) {
      return left.isExactMatch ? -1 : 1;
    }

    if (left.patternLength !== right.patternLength) {
      return right.patternLength - left.patternLength;
    }

    return 0;
  });

  return scoredRules[0]?.rule;
}

function arraysEqual(
  left: readonly string[],
  right: readonly string[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function logPlan(
  action: 'create' | 'update' | 'noop',
  branch: string,
  contexts: readonly string[],
  details?: {
    previousContexts?: readonly string[] | null;
    strict?: boolean;
    enforcedAdmins?: boolean;
  }
): void {
  console.log(`Branch protection plan for ${branch}: ${action.toUpperCase()}`);
  if (details?.previousContexts) {
    console.log(`  Previous contexts (${details.previousContexts.length}):`);
    for (const ctx of details.previousContexts) {
      console.log(`    - ${ctx}`);
    }
  }
  console.log(`  Required contexts (${contexts.length}):`);
  for (const ctx of contexts) {
    console.log(`    - ${ctx}`);
  }
  if (details) {
    if (details.strict !== undefined) {
      console.log(
        `  Requires strict status checks: ${details.strict ? 'yes' : 'no'}`
      );
    }
    if (details.enforcedAdmins !== undefined) {
      console.log(
        `  Administrators enforced: ${details.enforcedAdmins ? 'yes' : 'no'}`
      );
    }
  }
}

async function ensureBranchProtection(): Promise<void> {
  const args = parseArgs();
  const contexts = loadExpectedContexts();
  const { owner, repo } = deriveOwnerRepo(args.owner, args.repo);
  const token = resolveToken(args.token);
  const branch = args.branch;

  const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        id
        branchProtectionRules(first: 100) {
          nodes {
            id
            pattern
            requiredStatusCheckContexts
            requiresStatusChecks
            requiresStrictStatusChecks
            isAdminEnforced
            matchingRefs(first: 50) {
              nodes { name }
            }
          }
        }
      }
    }
  `;

  const data = await graphqlRequest<BranchProtectionQueryData>(token, query, {
    owner,
    repo,
  });
  if (!data.repository) {
    throw new Error(`Repository ${owner}/${repo} not found or inaccessible.`);
  }

  const rule = findProtectionRule(
    data.repository.branchProtectionRules.nodes,
    branch
  );

  if (!rule) {
    logPlan('create', branch, contexts);
    if (args.dryRun) {
      console.log('Dry run enabled; no changes applied.');
      return;
    }

    const createMutation = `
      mutation($input: CreateBranchProtectionRuleInput!) {
        createBranchProtectionRule(input: $input) {
          branchProtectionRule {
            id
            pattern
            requiredStatusCheckContexts
            requiresStatusChecks
            requiresStrictStatusChecks
            isAdminEnforced
          }
        }
      }
    `;

    const variables = {
      input: {
        repositoryId: data.repository.id,
        pattern: branch,
        requiredStatusCheckContexts: contexts,
        requiresStatusChecks: true,
        requiresStrictStatusChecks: true,
        isAdminEnforced: true,
      },
    };

    const response = await graphqlRequest<BranchProtectionMutationData>(
      token,
      createMutation,
      variables
    );
    const created = response.createBranchProtectionRule?.branchProtectionRule;
    if (!created) {
      throw new Error(
        'GitHub did not return the created branch protection rule.'
      );
    }
    console.log(
      `Created branch protection rule ${created.id} for ${owner}/${repo}@${branch}.`
    );
    return;
  }

  const existingContexts = rule.requiredStatusCheckContexts ?? [];
  const needsContextUpdate = !arraysEqual(existingContexts, contexts);
  const needsStrict =
    !rule.requiresStrictStatusChecks || !rule.requiresStatusChecks;
  const needsAdmin = !rule.isAdminEnforced;

  if (!needsContextUpdate && !needsStrict && !needsAdmin) {
    logPlan('noop', branch, contexts, {
      previousContexts: existingContexts,
      strict: rule.requiresStrictStatusChecks,
      enforcedAdmins: rule.isAdminEnforced,
    });
    console.log(
      'No updates required; branch protection already matches the manifest.'
    );
    return;
  }

  logPlan('update', branch, contexts, {
    previousContexts: existingContexts,
    strict: rule.requiresStrictStatusChecks,
    enforcedAdmins: rule.isAdminEnforced,
  });

  if (args.dryRun) {
    console.log('Dry run enabled; no changes applied.');
    return;
  }

  const updateMutation = `
    mutation($input: UpdateBranchProtectionRuleInput!) {
      updateBranchProtectionRule(input: $input) {
        branchProtectionRule {
          id
          requiredStatusCheckContexts
          requiresStatusChecks
          requiresStrictStatusChecks
          isAdminEnforced
        }
      }
    }
  `;

  const updateVariables = {
    input: {
      branchProtectionRuleId: rule.id,
      requiredStatusCheckContexts: contexts,
      requiresStatusChecks: true,
      requiresStrictStatusChecks: true,
      isAdminEnforced: true,
    },
  };

  const updateResponse = await graphqlRequest<BranchProtectionMutationData>(
    token,
    updateMutation,
    updateVariables
  );
  const updated =
    updateResponse.updateBranchProtectionRule?.branchProtectionRule;
  if (!updated) {
    throw new Error(
      'GitHub did not return the updated branch protection rule.'
    );
  }

  console.log('Updated branch protection rule:');
  console.log(
    `  Strict status checks: ${
      updated.requiresStrictStatusChecks ? 'enabled' : 'disabled'
    }`
  );
  console.log(
    `  Requires status checks: ${
      updated.requiresStatusChecks ? 'enabled' : 'disabled'
    }`
  );
  console.log(
    `  Administrators enforced: ${updated.isAdminEnforced ? 'yes' : 'no'}`
  );
  console.log(
    `  Contexts (${updated.requiredStatusCheckContexts?.length ?? 0}):`
  );
  for (const ctx of updated.requiredStatusCheckContexts ?? []) {
    console.log(`    - ${ctx}`);
  }
}

ensureBranchProtection().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
