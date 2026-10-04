import {
  MISSION_SOURCES,
  reviewMissionReport,
  sampleMissionReport,
} from './mission-fixture.mjs';

// Session-local teaching state. Real source/chain/provider claims are never fabricated.
export function createPreviewSession({ now = Date.now } = {}) {
  const jobs = new Map();
  const plans = new Map();
  const events = [];
  let nextJob = 1;
  let nextPlan = 1;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const labels = {
    post_job: 'create a preview job',
    apply: 'assign a simulated worker',
    submit: 'attach simulated evidence',
    validate: 'check submitted evidence',
    finalize: 'finalize a validated preview job',
    check_status: 'inspect a preview job',
    dispute: 'mark a preview job disputed',
  };
  return {
    plan(prompt, { artifact } = {}) {
      const text = String(prompt || '').trim();
      if (!text || text.length > 4000)
        throw new Error(
          'Describe an action in 1–4,000 characters. Start with Post, Apply, Submit, Validate, Finalize, Status or Dispute.'
        );
      const command = text
        .match(
          /^(post|create|apply|submit|validate|review|finalize|status|check|dispute)\b/i
        )?.[1]
        ?.toLowerCase();
      if (!command)
        throw new Error(
          'Preview uses explicit commands. Start a job with Post, or use Apply, Submit, Validate, Finalize, Status or Dispute followed by its job number.'
        );
      const kind =
        {
          post: 'post_job',
          create: 'post_job',
          review: 'validate',
          status: 'check_status',
          check: 'check_status',
        }[command] || command;
      const jobId = Number(
        text.match(/(?:job\s*#?\s*|#)(\d+)(?=\s|$|[.,](?:\s|$))/i)?.[1]
      );
      if (kind !== 'post_job' && (!Number.isSafeInteger(jobId) || jobId < 1))
        throw new Error(
          'Include a positive whole job number, for example: Submit job 1 with a source-cited report.'
        );
      const reward = text.match(/(\S+)\s*(?:AGIALPHA|AGIA)\b/i)?.[1] || '5';
      const days = text.match(/(\S+)\s+days?\b/i)?.[1] || '7';
      const intent =
        kind === 'post_job'
          ? {
              kind,
              title: text,
              reward_agialpha: reward,
              deadline_days: Number(days),
              scenario: /\brelease readiness brief\b/i.test(text)
                ? 'release-readiness'
                : 'custom',
            }
          : {
              kind,
              job_id: jobId,
              evidence: kind === 'submit' ? text : undefined,
              approved:
                kind === 'validate' ? !/\breject\b/i.test(text) : undefined,
            };
      if (
        kind === 'post_job' &&
        (!/^\d+(?:\.\d+)?$/.test(reward) ||
          !(Number(reward) > 0) ||
          !Number.isFinite(Number(reward)) ||
          !/^\d+$/.test(days) ||
          !Number.isSafeInteger(intent.deadline_days) ||
          intent.deadline_days < 1)
      )
        throw new Error(
          'Use a positive decimal reward and a positive whole number of days.'
        );
      if (
        kind === 'submit' &&
        jobs.get(jobId)?.scenario === 'release-readiness'
      ) {
        intent.artifact = artifact ?? sampleMissionReport();
        if (
          typeof intent.artifact !== 'string' ||
          intent.artifact.length > 20000
        )
          throw new Error(
            'The sample report must be text of at most 20,000 characters.'
          );
      }
      for (const [key, entry] of plans)
        if (entry.expiresAt <= now()) plans.delete(key);
      if (plans.size >= 1000)
        throw new Error(
          'Too many pending preview plans. Cancel one or reload after exporting your session.'
        );
      const planHash = `preview-plan-${nextPlan++}`;
      plans.set(planHash, {
        intent: JSON.stringify(intent),
        expiresAt: now() + 15 * 60 * 1000,
      });
      return {
        kind: 'job-intent',
        intent,
        planHash,
        requiresConfirmation: true,
        summary: `Preview only: ${labels[kind]}${
          kind === 'post_job'
            ? ` for ${intent.reward_agialpha} AGIALPHA over ${intent.deadline_days} days`
            : ` (job ${jobId})`
        }.${
          intent.artifact
            ? ' The report shown in Mission evidence is bound to this plan.'
            : ''
        } Confirm?`,
        warnings: [
          'This session uses simulated work and review. No funds, provider calls or blockchain transactions.',
        ],
        raw: { simulated: true, planHash, intent: clone(intent) },
      };
    },
    cancel(planHash) {
      plans.delete(planHash);
    },
    execute(intent, planHash) {
      const plan = plans.get(planHash);
      if (!plan || plan.intent !== JSON.stringify(intent))
        throw new Error(
          'Preview plan changed or was already used. Create a fresh plan.'
        );
      plans.delete(planHash);
      if (plan.expiresAt <= now())
        throw new Error(
          'Preview plan expired after 15 minutes. Review a fresh plan.'
        );
      if (events.length >= 2000)
        throw new Error(
          'This teaching session reached 2,000 events. Export it and reload to start another.'
        );
      let job;
      if (intent.kind === 'post_job') {
        if (jobs.size >= 200)
          throw new Error(
            'This teaching session reached 200 jobs. Export it and reload to start another.'
          );
        job = {
          jobId: nextJob++,
          title: intent.title,
          scenario: intent.scenario,
          reward: intent.reward_agialpha,
          rewardToken: 'AGIALPHA (simulated)',
          deadlineDays: intent.deadline_days,
          status: 'created',
          statusLabel: 'Preview · Created',
          evidence: null,
        };
        jobs.set(job.jobId, job);
      } else {
        job = jobs.get(intent.job_id);
        if (!job)
          throw new Error(
            `Preview job ${intent.job_id} does not exist in this session. Create one first.`
          );
        const transitions = {
          apply: [['created'], 'assigned'],
          submit: [['assigned', 'rejected'], 'submitted'],
          validate: [['submitted'], intent.approved ? 'validated' : 'rejected'],
          finalize: [['validated'], 'finalized'],
          dispute: [['rejected'], 'disputed'],
        };
        if (intent.kind !== 'check_status') {
          const transition = transitions[intent.kind];
          if (!transition || !transition[0].includes(job.status))
            throw new Error(
              `Cannot ${intent.kind} job ${job.jobId} while it is ${
                job.status
              }. ${
                intent.kind === 'finalize'
                  ? 'Submit evidence and record an approving review first.'
                  : 'Follow the lifecycle steps in order; rejected evidence can be corrected and resubmitted.'
              }`
            );
          if (
            intent.kind === 'validate' &&
            job.scenario === 'release-readiness'
          ) {
            job.review = reviewMissionReport(job.artifact);
            if (!intent.approved) {
              job.review.checks.push({
                label: 'Reviewer accepts the report',
                passed: false,
              });
              job.review.approved = false;
            }
            transition[1] = job.review.approved ? 'validated' : 'rejected';
          }
          job.status = transition[1];
          job.statusLabel = `Preview · ${job.status[0].toUpperCase()}${job.status.slice(
            1
          )}`;
          if (intent.kind === 'submit') {
            job.evidence = intent.evidence;
            job.artifact = intent.artifact ?? null;
            job.review = null;
          }
          if (intent.kind === 'apply') job.assignee = 'Simulated worker';
        }
      }
      const event = {
        sequence: events.length + 1,
        planHash,
        action: intent.kind,
        jobId: job.jobId,
        status: job.status,
        simulated: true,
        chainTransactions: 0,
        ...(intent.kind === 'submit'
          ? { artifact: job.artifact, evidence: job.evidence }
          : {}),
        ...(intent.kind === 'validate' && job.review
          ? { review: clone(job.review) }
          : {}),
      };
      events.push(event);
      return {
        ok: true,
        demo: true,
        jobId: job.jobId,
        message: `Preview job ${job.jobId}: ${
          job.status
        }. No transaction sent.${
          job.status === 'rejected'
            ? ' Inspect the failed checks, correct the report and submit again, or open a dispute.'
            : ''
        }`,
        receipt: clone(event),
      };
    },
    jobs: () => clone([...jobs.values()].reverse()),
    evidence: () =>
      clone({
        schemaVersion: 1,
        simulated: true,
        productionApproved: false,
        chainTransactions: 0,
        fixtureSources: MISSION_SOURCES,
        jobs: [...jobs.values()],
        events,
      }),
  };
}
