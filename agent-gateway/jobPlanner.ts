import fs from 'fs';
import path from 'path';
import { Wallet } from 'ethers';
import { postJob, EmployerJobSpec } from './employer';
import { orchestratorWallet } from './utils';
import { secureLogAction } from './security';
import { recordPlannerTrace } from './telemetry';

export type JobPlanStatus =
  | 'draft'
  | 'active'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type JobPlanTaskState = 'pending' | 'posted' | 'completed' | 'failed';

export interface JobPlanTaskSpec {
  id: string;
  spec: EmployerJobSpec;
  dependencies?: string[];
}

export interface JobPlanDefinition {
  planId: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  tasks: JobPlanTaskSpec[];
}

export interface PlanHistoryEntry {
  timestamp: string;
  event: string;
  taskId?: string;
  jobId?: string;
  success?: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface JobPlanTaskRecord {
  id: string;
  spec: EmployerJobSpec;
  dependencies: string[];
  state: JobPlanTaskState;
  attempts: number;
  jobId?: string;
  txHash?: string;
  postedAt?: string;
  completedAt?: string;
  success?: boolean;
  lastError?: string;
}

export interface JobPlanRecord {
  planId: string;
  description?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  status: JobPlanStatus;
  createdAt: string;
  updatedAt: string;
  tasks: JobPlanTaskRecord[];
  history: PlanHistoryEntry[];
}

export interface JobPlanSummary {
  planId: string;
  description?: string;
  status: JobPlanStatus;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
}

export interface LaunchPlanOptions {
  wallet?: Wallet;
  taskIds?: string[];
  maxTasks?: number;
}

export interface LaunchPlanResult {
  plan: JobPlanRecord;
  launchedTasks: Array<{ taskId: string; jobId: string; txHash: string }>;
  skippedTasks: Array<{ taskId: string; error: string }>;
  pendingTaskIds: string[];
}

const PLAN_DIR = path.resolve(__dirname, '../storage/employer/plans');
const HISTORY_LIMIT = Math.max(
  1,
  Number(process.env.JOB_PLAN_HISTORY_LIMIT || '200')
);

class AsyncLock {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const attempt = () => {
        if (!this.locked) {
          this.locked = true;
          resolve(() => this.release());
        } else {
          this.queue.push(attempt);
        }
      };
      attempt();
    });
  }

  private release(): void {
    this.locked = false;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

const planLocks = new Map<string, AsyncLock>();
const planCache = new Map<string, JobPlanRecord>();
const jobIndex = new Map<string, { planId: string; taskId: string }>();

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function planPath(planId: string): string {
  return path.join(PLAN_DIR, `${planId}.json`);
}

function normaliseIdentifier(value: string, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  if (!/^[a-z0-9-]+$/.test(trimmed)) {
    throw new Error(
      `${label} may only contain lowercase letters, numbers, and hyphens`
    );
  }
  return trimmed;
}

function cloneSpec(spec: EmployerJobSpec): EmployerJobSpec {
  if (!spec || typeof spec !== 'object') {
    throw new Error('task spec must be an object');
  }
  if (!spec.description || !spec.reward) {
    throw new Error('task spec requires description and reward');
  }
  const metadata = spec.metadata
    ? JSON.parse(JSON.stringify(spec.metadata))
    : undefined;
  const dependencies = Array.isArray(spec.dependencies)
    ? [...spec.dependencies]
    : undefined;
  return {
    description: spec.description,
    reward: String(spec.reward),
    deadlineSeconds: spec.deadlineSeconds,
    metadata,
    dependencies,
    uri: spec.uri,
  };
}

function appendHistory(plan: JobPlanRecord, entry: PlanHistoryEntry): void {
  plan.history.push(entry);
  if (plan.history.length > HISTORY_LIMIT) {
    plan.history.splice(0, plan.history.length - HISTORY_LIMIT);
  }
}

function summarisePlan(plan: JobPlanRecord): JobPlanSummary {
  const totalTasks = plan.tasks.length;
  const completedTasks = plan.tasks.filter(
    (task) => task.state === 'completed'
  ).length;
  const failedTasks = plan.tasks.filter(
    (task) => task.state === 'failed'
  ).length;
  const pendingTasks = plan.tasks.filter(
    (task) => task.state === 'pending'
  ).length;
  return {
    planId: plan.planId,
    description: plan.description,
    status: plan.status,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    tags: [...plan.tags],
    totalTasks,
    completedTasks,
    failedTasks,
    pendingTasks,
  };
}

function clonePlan(plan: JobPlanRecord): JobPlanRecord {
  return JSON.parse(JSON.stringify(plan)) as JobPlanRecord;
}

async function withPlanLock<T>(
  planId: string,
  fn: () => Promise<T>
): Promise<T> {
  let lock = planLocks.get(planId);
  if (!lock) {
    lock = new AsyncLock();
    planLocks.set(planId, lock);
  }
  const release = await lock.acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

function reindexPlan(plan: JobPlanRecord): void {
  for (const [jobId, mapping] of jobIndex.entries()) {
    if (mapping.planId === plan.planId) {
      jobIndex.delete(jobId);
    }
  }
  for (const task of plan.tasks) {
    if (task.jobId) {
      jobIndex.set(task.jobId, { planId: plan.planId, taskId: task.id });
    }
  }
}

async function readPlan(planId: string): Promise<JobPlanRecord> {
  ensureDir(PLAN_DIR);
  const filePath = planPath(planId);
  const raw = await fs.promises.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as JobPlanRecord;
  parsed.tasks = (parsed.tasks || []).map((task) => ({
    ...task,
    dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
    attempts: typeof task.attempts === 'number' ? task.attempts : 0,
  }));
  parsed.tags = Array.isArray(parsed.tags)
    ? parsed.tags.map((tag) => tag.trim()).filter(Boolean)
    : [];
  parsed.history = Array.isArray(parsed.history) ? parsed.history : [];
  if (!parsed.status) {
    parsed.status = 'draft';
  }
  return parsed;
}

async function savePlan(plan: JobPlanRecord): Promise<JobPlanRecord> {
  ensureDir(PLAN_DIR);
  plan.updatedAt = new Date().toISOString();
  await fs.promises.writeFile(
    planPath(plan.planId),
    JSON.stringify(plan, null, 2),
    'utf8'
  );
  planCache.set(plan.planId, plan);
  reindexPlan(plan);
  return plan;
}

function assertNoCycles(tasks: JobPlanTaskRecord[]): void {
  const adjacency = new Map<string, string[]>();
  for (const task of tasks) {
    adjacency.set(task.id, [...task.dependencies]);
  }
  const visited = new Set<string>();
  const stack = new Set<string>();

  const visit = (node: string) => {
    if (stack.has(node)) {
      throw new Error(`cyclic dependency detected involving task ${node}`);
    }
    if (visited.has(node)) {
      return;
    }
    stack.add(node);
    for (const dep of adjacency.get(node) || []) {
      visit(dep);
    }
    stack.delete(node);
    visited.add(node);
  };

  for (const task of tasks) {
    visit(task.id);
  }
}

function dependenciesSatisfied(
  plan: JobPlanRecord,
  task: JobPlanTaskRecord
): boolean {
  for (const dep of task.dependencies) {
    const dependency = plan.tasks.find((candidate) => candidate.id === dep);
    if (!dependency) {
      return false;
    }
    if (dependency.state !== 'completed' || dependency.success === false) {
      return false;
    }
  }
  return true;
}
let initialised = false;
let initialising: Promise<void> | null = null;

async function loadPlanIntoCache(
  planId: string
): Promise<JobPlanRecord | null> {
  try {
    const plan = await readPlan(planId);
    planCache.set(planId, plan);
    reindexPlan(plan);
    return plan;
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export async function initJobPlanner(): Promise<void> {
  if (initialised) {
    return;
  }
  if (initialising) {
    await initialising;
    return;
  }
  initialising = (async () => {
    ensureDir(PLAN_DIR);
    const files = await fs.promises.readdir(PLAN_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }
      try {
        const identifier = normaliseIdentifier(
          file.replace(/\.json$/, ''),
          'planId'
        );
        if (planCache.has(identifier)) {
          continue;
        }
        await loadPlanIntoCache(identifier);
      } catch (err) {
        console.warn('Failed to load job plan from disk', file, err);
      }
    }
    initialised = true;
    initialising = null;
  })();
  await initialising;
}

async function ensureInitialised(): Promise<void> {
  if (!initialised) {
    await initJobPlanner();
  }
}

async function getPlanInternal(planId: string): Promise<JobPlanRecord | null> {
  const identifier = normaliseIdentifier(planId, 'planId');
  await ensureInitialised();
  if (planCache.has(identifier)) {
    return planCache.get(identifier)!;
  }
  return loadPlanIntoCache(identifier);
}

async function requirePlan(planId: string): Promise<JobPlanRecord> {
  const plan = await getPlanInternal(planId);
  if (!plan) {
    throw new Error(`plan ${normaliseIdentifier(planId, 'planId')} not found`);
  }
  return plan;
}

function cloneMetadata(
  value: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

export async function listJobPlans(): Promise<JobPlanSummary[]> {
  await ensureInitialised();
  const summaries = Array.from(planCache.values()).map(summarisePlan);
  summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return summaries;
}

export async function getJobPlan(
  planId: string
): Promise<JobPlanRecord | null> {
  const plan = await getPlanInternal(planId);
  if (!plan) {
    return null;
  }
  return clonePlan(plan);
}

export async function createJobPlan(
  definition: JobPlanDefinition
): Promise<JobPlanRecord> {
  if (!definition || typeof definition !== 'object') {
    throw new Error('job plan definition is required');
  }
  const planId = normaliseIdentifier(definition.planId, 'planId');
  await ensureInitialised();
  return withPlanLock(planId, async () => {
    if (planCache.has(planId)) {
      throw new Error(`plan ${planId} already exists`);
    }
    const tasksInput = Array.isArray(definition.tasks) ? definition.tasks : [];
    if (tasksInput.length === 0) {
      throw new Error('job plan must include at least one task');
    }
    const seen = new Set<string>();
    const taskRecords: JobPlanTaskRecord[] = tasksInput.map((item, index) => {
      if (!item || typeof item !== 'object') {
        throw new Error(`task definition at index ${index} is invalid`);
      }
      const taskId = normaliseIdentifier(item.id, 'task id');
      if (seen.has(taskId)) {
        throw new Error(`task id ${taskId} is duplicated`);
      }
      seen.add(taskId);
      const deps = Array.isArray(item.dependencies)
        ? item.dependencies.map((dep) =>
            normaliseIdentifier(dep, 'dependency id')
          )
        : [];
      if (deps.includes(taskId)) {
        throw new Error(`task ${taskId} cannot depend on itself`);
      }
      const spec = cloneSpec(item.spec);
      return {
        id: taskId,
        spec,
        dependencies: deps,
        state: 'pending',
        attempts: 0,
      };
    });

    for (const task of taskRecords) {
      for (const dep of task.dependencies) {
        if (!seen.has(dep)) {
          throw new Error(`task ${task.id} depends on unknown task ${dep}`);
        }
      }
    }

    assertNoCycles(taskRecords);

    const now = new Date().toISOString();
    const plan: JobPlanRecord = {
      planId,
      description: definition.description,
      tags: Array.isArray(definition.tags)
        ? definition.tags.map((tag) => tag.trim()).filter(Boolean)
        : [],
      metadata: cloneMetadata(definition.metadata),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      tasks: taskRecords,
      history: [],
    };
    appendHistory(plan, {
      timestamp: now,
      event: 'plan-created',
      metadata: { taskCount: taskRecords.length },
    });
    await savePlan(plan);
    await secureLogAction({
      component: 'job-planner',
      action: 'plan-create',
      success: true,
      metadata: { planId, taskCount: taskRecords.length },
    });
    await recordPlannerTrace({
      planId,
      event: 'plan-created',
      timestamp: now,
      success: true,
      metadata: { taskCount: taskRecords.length },
    });
    return clonePlan(plan);
  });
}
function enrichSpecWithPlanContext(
  plan: JobPlanRecord,
  task: JobPlanTaskRecord
): EmployerJobSpec {
  const metadata = {
    ...(task.spec.metadata ?? {}),
    planId: plan.planId,
    planTaskId: task.id,
    planDependencies: task.dependencies,
  };
  return {
    ...task.spec,
    metadata,
  };
}

async function postPlanTask(
  plan: JobPlanRecord,
  task: JobPlanTaskRecord,
  wallet: Wallet
): Promise<void> {
  const spec = enrichSpecWithPlanContext(plan, task);
  const record = await postJob(spec, wallet);
  task.jobId = record.jobId.toString();
  task.txHash = record.txHash;
  const postedAt = new Date().toISOString();
  task.postedAt = postedAt;
  task.state = 'posted';
  task.attempts += 1;
  task.lastError = undefined;
  jobIndex.set(task.jobId, { planId: plan.planId, taskId: task.id });
  appendHistory(plan, {
    timestamp: postedAt,
    event: 'task-posted',
    taskId: task.id,
    jobId: task.jobId,
    metadata: { txHash: record.txHash },
  });
  await secureLogAction({
    component: 'job-planner',
    action: 'plan-task-posted',
    jobId: task.jobId,
    success: true,
    metadata: {
      planId: plan.planId,
      taskId: task.id,
      txHash: record.txHash,
    },
  });
  await recordPlannerTrace({
    planId: plan.planId,
    event: 'task-posted',
    taskId: task.id,
    jobId: task.jobId,
    timestamp: postedAt,
    success: true,
    metadata: { txHash: record.txHash },
  });
}

export async function launchJobPlan(
  planId: string,
  options: LaunchPlanOptions = {}
): Promise<LaunchPlanResult> {
  await ensureInitialised();
  const identifier = normaliseIdentifier(planId, 'planId');
  const wallet = options.wallet ?? orchestratorWallet;
  if (!wallet) {
    throw new Error('no orchestrator wallet available to launch job plans');
  }
  const allowedIds = Array.isArray(options.taskIds)
    ? new Set(
        options.taskIds.map((value) => normaliseIdentifier(value, 'task id'))
      )
    : null;
  const maxTasks =
    typeof options.maxTasks === 'number' && options.maxTasks >= 0
      ? Math.floor(options.maxTasks)
      : undefined;

  return withPlanLock(identifier, async () => {
    const plan = await requirePlan(identifier);
    if (plan.status === 'failed' || plan.status === 'cancelled') {
      throw new Error(`plan ${identifier} is not active`);
    }
    if (plan.status === 'completed') {
      return {
        plan: clonePlan(plan),
        launchedTasks: [],
        skippedTasks: [],
        pendingTaskIds: [],
      };
    }

    if (plan.status === 'draft') {
      plan.status = 'active';
      const activatedAt = new Date().toISOString();
      appendHistory(plan, { timestamp: activatedAt, event: 'plan-activated' });
      await secureLogAction({
        component: 'job-planner',
        action: 'plan-activated',
        success: true,
        metadata: { planId: plan.planId },
      });
      await recordPlannerTrace({
        planId: plan.planId,
        event: 'plan-activated',
        timestamp: activatedAt,
        success: true,
      });
    }

    let readyTasks = plan.tasks.filter((task) => task.state === 'pending');
    if (allowedIds) {
      readyTasks = readyTasks.filter((task) => allowedIds.has(task.id));
    }
    readyTasks = readyTasks.filter((task) => dependenciesSatisfied(plan, task));
    if (maxTasks !== undefined) {
      readyTasks = readyTasks.slice(0, maxTasks);
    }

    const launched: Array<{ taskId: string; jobId: string; txHash: string }> =
      [];
    const skipped: Array<{ taskId: string; error: string }> = [];

    for (const task of readyTasks) {
      try {
        await postPlanTask(plan, task, wallet);
        if (task.jobId && task.txHash) {
          launched.push({
            taskId: task.id,
            jobId: task.jobId,
            txHash: task.txHash,
          });
        }
      } catch (err: any) {
        const message = err?.message ? String(err.message) : String(err);
        task.lastError = message;
        task.attempts += 1;
        appendHistory(plan, {
          timestamp: new Date().toISOString(),
          event: 'task-post-failed',
          taskId: task.id,
          error: message,
        });
        skipped.push({ taskId: task.id, error: message });
        await secureLogAction({
          component: 'job-planner',
          action: 'plan-task-post-failed',
          success: false,
          metadata: {
            planId: plan.planId,
            taskId: task.id,
            error: message,
          },
        });
        await recordPlannerTrace({
          planId: plan.planId,
          event: 'task-post-failed',
          taskId: task.id,
          timestamp: new Date().toISOString(),
          success: false,
          metadata: { error: message },
        });
      }
    }

    await savePlan(plan);
    return {
      plan: clonePlan(plan),
      launchedTasks: launched,
      skippedTasks: skipped,
      pendingTaskIds: plan.tasks
        .filter((task) => task.state === 'pending')
        .map((task) => task.id),
    };
  });
}

export async function resumeActivePlans(
  options: LaunchPlanOptions = {}
): Promise<void> {
  await ensureInitialised();
  const wallet = options.wallet ?? orchestratorWallet;
  if (!wallet) {
    console.warn('resumeActivePlans skipped: orchestrator wallet unavailable');
    return;
  }
  for (const plan of planCache.values()) {
    if (plan.status !== 'active') {
      continue;
    }
    try {
      await launchJobPlan(plan.planId, { ...options, wallet });
    } catch (err) {
      console.error('Failed to resume job plan', plan.planId, err);
    }
  }
}

export async function handleJobCompletion(
  jobId: string,
  success: boolean
): Promise<void> {
  if (!jobId) {
    return;
  }
  const mapping = jobIndex.get(jobId);
  if (!mapping) {
    return;
  }
  const { planId, taskId } = mapping;
  let shouldResume = false;
  await withPlanLock(planId, async () => {
    const plan = await requirePlan(planId);
    const task = plan.tasks.find((candidate) => candidate.id === taskId);
    if (!task || task.jobId !== jobId) {
      jobIndex.delete(jobId);
      return;
    }
    task.state = success ? 'completed' : 'failed';
    task.success = success;
    task.completedAt = new Date().toISOString();
    appendHistory(plan, {
      timestamp: task.completedAt,
      event: success ? 'task-completed' : 'task-failed',
      taskId: task.id,
      jobId,
      success,
    });
    await secureLogAction({
      component: 'job-planner',
      action: success ? 'plan-task-completed' : 'plan-task-failed',
      jobId,
      success,
      metadata: { planId: plan.planId, taskId: task.id },
    });
    await recordPlannerTrace({
      planId: plan.planId,
      event: success ? 'task-completed' : 'task-failed',
      taskId: task.id,
      jobId,
      timestamp: task.completedAt,
      success,
    });
    jobIndex.delete(jobId);

    if (!success) {
      if (plan.status !== 'failed') {
        plan.status = 'failed';
        const failedAt = new Date().toISOString();
        appendHistory(plan, {
          timestamp: failedAt,
          event: 'plan-failed',
          taskId: task.id,
          jobId,
          success: false,
        });
        await secureLogAction({
          component: 'job-planner',
          action: 'plan-failed',
          success: false,
          metadata: { planId: plan.planId, failingTask: task.id },
        });
        await recordPlannerTrace({
          planId: plan.planId,
          event: 'plan-failed',
          taskId: task.id,
          jobId,
          timestamp: failedAt,
          success: false,
          metadata: { failingTask: task.id },
        });
      }
    } else {
      const remaining = plan.tasks.filter(
        (candidate) => candidate.state !== 'completed'
      );
      if (remaining.length === 0) {
        plan.status = 'completed';
        const completedAt = new Date().toISOString();
        appendHistory(plan, {
          timestamp: completedAt,
          event: 'plan-completed',
        });
        await secureLogAction({
          component: 'job-planner',
          action: 'plan-completed',
          success: true,
          metadata: { planId: plan.planId },
        });
        await recordPlannerTrace({
          planId: plan.planId,
          event: 'plan-completed',
          timestamp: completedAt,
          success: true,
        });
      } else if (
        plan.status === 'active' &&
        remaining.some(
          (candidate) =>
            candidate.state === 'pending' &&
            dependenciesSatisfied(plan, candidate)
        )
      ) {
        shouldResume = true;
      }
    }
    await savePlan(plan);
  });
  if (shouldResume) {
    try {
      await launchJobPlan(planId);
    } catch (err) {
      console.error('job plan resume failed', planId, err);
    }
  }
}
