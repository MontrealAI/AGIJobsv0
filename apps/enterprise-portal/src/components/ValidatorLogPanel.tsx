'use client';

import { useMemo } from 'react';
import type { JobTimelineEvent, ValidatorInsight } from '../types';

const deriveValidatorInsights = (events: JobTimelineEvent[]): ValidatorInsight[] => {
  const insights = new Map<string, ValidatorInsight>();
  for (const event of events) {
    if (!event.actor) continue;
    const existing = insights.get(event.actor) ?? { validator: event.actor, stake: 0n };
    if (event.name === 'ValidationStartTriggered') {
      existing.vote = undefined;
    }
    if (event.name === 'JobFinalized') {
      existing.vote = 'approve';
      existing.revealedAt = event.timestamp;
    }
    if (event.name === 'JobDisputed') {
      existing.vote = 'reject';
      existing.revealedAt = event.timestamp;
    }
    insights.set(event.actor, existing);
  }
  return Array.from(insights.values());
};

export const ValidatorLogPanel = ({ events }: { events: JobTimelineEvent[] }) => {
  const validatorEvents = useMemo(
    () => events.filter((evt) => ['ValidationStartTriggered', 'JobFinalized', 'JobDisputed'].includes(evt.name)),
    [events]
  );
  const insights = useMemo(() => deriveValidatorInsights(validatorEvents), [validatorEvents]);

  return (
    <section>
      <div className="card-title">
        <div>
          <h2>Validator Committee Activity</h2>
          <p>Live visibility into commit / reveal outcomes, validator votes, and dispute escalations.</p>
        </div>
        <div className="tag orange">Validation</div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Validator</th>
            <th>Vote</th>
            <th>Last action</th>
          </tr>
        </thead>
        <tbody>
          {insights.map((insight) => (
            <tr key={insight.validator}>
              <td>{`${insight.validator.slice(0, 6)}…${insight.validator.slice(-4)}`}</td>
              <td>
                <span className={`tag ${insight.vote === 'approve' ? 'green' : insight.vote === 'reject' ? 'red' : 'purple'}`}>
                  {insight.vote ? insight.vote.toUpperCase() : 'PENDING'}
                </span>
              </td>
              <td>{insight.revealedAt ? new Date(insight.revealedAt * 1000).toLocaleString() : 'Awaiting reveal'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {insights.length === 0 && <div className="small">No validator actions recorded yet.</div>}
      <div className="alert" style={{ marginTop: '1rem' }}>
        The panel listens to JobRegistry validation events and surfaces them in near real-time. Off-chain automation can enrich
        entries with stake sizes and commit / reveal metadata by combining ValidationModule logs via the same pattern.
      </div>
    </section>
  );
};
