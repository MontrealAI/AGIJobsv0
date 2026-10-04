export const stages = [
  'Define the mission',
  'Submit the work',
  'Validate the evidence',
  'Settle the job',
];

export function advance(state, inputs) {
  if (state.blocked || state.step === stages.length) return state;
  const next = { ...state, events: [...state.events] };
  if (state.step === 1 && !inputs.evidence) {
    next.blocked = true;
    next.outcome = 'Evidence missing';
    next.events.push(
      'Submission held: the required evidence was not supplied.'
    );
    return next;
  }
  if (state.step === 2 && inputs.vote !== 'approve') {
    next.blocked = true;
    next.outcome =
      inputs.vote === 'reject' ? 'Review required' : 'Validation incomplete';
    next.events.push(
      inputs.vote === 'reject'
        ? 'Validators rejected the result. Settlement remains blocked.'
        : 'The committee has not completed validation. Settlement remains blocked.'
    );
    return next;
  }
  next.events.push(
    [
      'The mission scope and evidence requirements are agreed.',
      'The worker submits a result with its required evidence.',
      'Every selected validator approves in this simplified walkthrough.',
      'The illustrated job reaches settlement. No real transaction is sent.',
    ][state.step]
  );
  next.step += 1;
  next.outcome =
    next.step === stages.length
      ? 'Simulated settlement complete'
      : stages[next.step];
  return next;
}

export function receipt(state, scenario, inputs) {
  return {
    schemaVersion: 1,
    evidenceClass: 'browser-walkthrough',
    simulated: true,
    productionApproved: false,
    chainTransactions: 0,
    scenario,
    inputs: { evidence: inputs.evidence, vote: inputs.vote },
    completedStages: state.step,
    blocked: state.blocked,
    settled: state.step === stages.length && !state.blocked,
    outcome: state.outcome,
    events: [...state.events],
  };
}
