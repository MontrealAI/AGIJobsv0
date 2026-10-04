// A session-local teaching model. It never creates chain receipts or provider results.
export function createPreviewSession() {
  const jobs = new Map();
  const plans = new Map();
  const events = [];
  let nextJob = 1;
  let nextPlan = 1;
  const clone = value => JSON.parse(JSON.stringify(value));
  const labels = { post_job: 'create a preview job', apply: 'assign a simulated worker', submit: 'attach simulated evidence', validate: 'record a simulated review', finalize: 'finalize a validated preview job', check_status: 'inspect a preview job', dispute: 'mark a preview job disputed' };
  return {
    plan(prompt) {
      const text = String(prompt || '').trim();
      if (!text) throw new Error('Describe a job or a lifecycle action first.');
      const command = text.match(/^(apply|submit|validate|review|finalize|status|check|dispute)\b/i)?.[1]?.toLowerCase();
      const kind = { review: 'validate', status: 'check_status', check: 'check_status' }[command] || command || 'post_job';
      const jobId = Number(text.match(/(?:job\s*#?\s*|#)(\d+)/i)?.[1]);
      if (kind !== 'post_job' && (!Number.isSafeInteger(jobId) || jobId < 1)) throw new Error('Include the job number, for example: Submit job 1 with a source-cited report.');
      const intent = kind === 'post_job'
        ? { kind, title: text, reward_agialpha: text.match(/(\d+(?:\.\d+)?)\s*(?:AGIALPHA|AGIA)\b/i)?.[1] || '5', deadline_days: Number(text.match(/(\d+)\s*days?\b/i)?.[1] || 7) }
        : { kind, job_id: jobId, evidence: kind === 'submit' ? text : undefined, approved: kind === 'validate' ? !/\breject\b/i.test(text) : undefined };
      if (kind === 'post_job' && (!(Number(intent.reward_agialpha) > 0) || !Number.isFinite(Number(intent.reward_agialpha)) || !Number.isSafeInteger(intent.deadline_days) || intent.deadline_days < 1)) throw new Error('Use a positive reward and a positive whole number of days.');
      const planHash = `preview-plan-${nextPlan++}`;
      plans.set(planHash, JSON.stringify(intent));
      return { kind: 'job-intent', intent, planHash, requiresConfirmation: true, summary: `Preview only: ${labels[kind]}${kind === 'post_job' ? ` for ${intent.reward_agialpha} AGIALPHA over ${intent.deadline_days} days` : ` (job ${jobId})`}. Confirm?`, warnings: ['This session uses simulated work and review. No funds, provider calls or blockchain transactions.'], raw: { simulated: true, planHash } };
    },
    execute(intent, planHash) {
      if (!plans.has(planHash) || plans.get(planHash) !== JSON.stringify(intent)) throw new Error('Preview plan changed or was already used. Create a fresh plan.');
      plans.delete(planHash);
      let job;
      if (intent.kind === 'post_job') {
        job = { jobId: nextJob++, title: intent.title, reward: intent.reward_agialpha, rewardToken: 'AGIALPHA (simulated)', deadlineDays: intent.deadline_days, status: 'created', statusLabel: 'Preview · Created', evidence: null };
        jobs.set(job.jobId, job);
      } else {
        job = jobs.get(intent.job_id);
        if (!job) throw new Error(`Preview job ${intent.job_id} does not exist in this session. Create one first.`);
        const transitions = { apply: ['created', 'assigned'], submit: ['assigned', 'submitted'], validate: ['submitted', intent.approved ? 'validated' : 'rejected'], finalize: ['validated', 'finalized'], dispute: ['rejected', 'disputed'] };
        if (intent.kind !== 'check_status') {
          const transition = transitions[intent.kind];
          if (!transition || job.status !== transition[0]) throw new Error(`Cannot ${intent.kind} job ${job.jobId} while it is ${job.status}. ${intent.kind === 'finalize' ? 'Submit evidence and record an approving review first.' : 'Follow the lifecycle steps in order.'}`);
          job.status = transition[1];
          job.statusLabel = `Preview · ${job.status[0].toUpperCase()}${job.status.slice(1)}`;
          if (intent.kind === 'submit') job.evidence = intent.evidence;
          if (intent.kind === 'apply') job.assignee = 'Simulated worker';
        }
      }
      const event = { sequence: events.length + 1, planHash, action: intent.kind, jobId: job.jobId, status: job.status, simulated: true, chainTransactions: 0 };
      events.push(event);
      return { ok: true, demo: true, jobId: job.jobId, message: `Preview job ${job.jobId}: ${job.status}. No transaction sent.`, receipt: clone(event) };
    },
    jobs: () => clone([...jobs.values()].reverse()),
    evidence: () => clone({ schemaVersion: 1, simulated: true, productionApproved: false, chainTransactions: 0, jobs: [...jobs.values()], events }),
  };
}
