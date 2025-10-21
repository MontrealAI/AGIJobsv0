'use client';

import type { ChatStage } from './ChatWindow';

type MissionPulseProps = {
  stage: ChatStage;
  orchestratorReady: boolean;
  planError: string | null;
  simulateError: string | null;
  executeError: string | null;
  hasPlan: boolean;
  hasSimulation: boolean;
  statusSummary: string | null;
  runState: string | null;
};

type PulseState = 'pending' | 'active' | 'complete' | 'blocked';

type PulseCard = {
  id: string;
  title: string;
  caption: string;
  status: PulseState;
  detail: string;
};

const statusIcon: Record<PulseState, string> = {
  pending: '🌙',
  active: '⚡',
  complete: '🏁',
  blocked: '⚠️',
};

const statusLabel: Record<PulseState, string> = {
  pending: 'Standing by',
  active: 'In flight',
  complete: 'Complete',
  blocked: 'Needs attention',
};

function computePlanCard({
  stage,
  orchestratorReady,
  hasPlan,
  planError,
}: Pick<MissionPulseProps, 'stage' | 'orchestratorReady' | 'hasPlan' | 'planError'>): PulseCard {
  if (planError) {
    return {
      id: 'planner',
      title: 'Planner',
      caption: 'LLM orchestrator',
      status: 'blocked',
      detail: planError,
    };
  }

  if (stage === 'planning') {
    return {
      id: 'planner',
      title: 'Planner',
      caption: 'LLM orchestrator',
      status: 'active',
      detail: 'Synthesising the mission blueprint and policy guardrails.',
    };
  }

  if (hasPlan) {
    return {
      id: 'planner',
      title: 'Planner',
      caption: 'LLM orchestrator',
      status: 'complete',
      detail: 'Blueprint ready. Proceed to simulation to validate economics.',
    };
  }

  return {
    id: 'planner',
    title: 'Planner',
    caption: 'LLM orchestrator',
    status: orchestratorReady ? 'pending' : 'blocked',
    detail: orchestratorReady
      ? 'Awaiting your mission description to draft the on-chain workload.'
      : 'Point the mission panel at a live orchestrator to unlock planning.',
  };
}

function computeSimulationCard({
  stage,
  hasPlan,
  hasSimulation,
  simulateError,
}: Pick<MissionPulseProps, 'stage' | 'hasPlan' | 'hasSimulation' | 'simulateError'>): PulseCard {
  if (simulateError) {
    return {
      id: 'simulation',
      title: 'Simulation',
      caption: 'Risk + policy engine',
      status: 'blocked',
      detail: simulateError,
    };
  }

  if (stage === 'simulating') {
    return {
      id: 'simulation',
      title: 'Simulation',
      caption: 'Risk + policy engine',
      status: 'active',
      detail: 'Stress-testing rewards, fees, and guardrails before any capital moves.',
    };
  }

  if (hasSimulation) {
    return {
      id: 'simulation',
      title: 'Simulation',
      caption: 'Risk + policy engine',
      status: 'complete',
      detail: 'All guardrails satisfied. You can execute with one confirmation.',
    };
  }

  return {
    id: 'simulation',
    title: 'Simulation',
    caption: 'Risk + policy engine',
    status: hasPlan ? 'pending' : 'blocked',
    detail: hasPlan
      ? 'Run the simulation to confirm budget sufficiency and compliance.'
      : 'Draft a mission plan before running the policy simulator.',
  };
}

function computeExecutionCard({
  stage,
  hasSimulation,
  executeError,
}: Pick<MissionPulseProps, 'stage' | 'hasSimulation' | 'executeError'>): PulseCard {
  if (executeError) {
    return {
      id: 'execution',
      title: 'Execution',
      caption: 'Relayer + escrow',
      status: 'blocked',
      detail: executeError,
    };
  }

  if (stage === 'executing') {
    return {
      id: 'execution',
      title: 'Execution',
      caption: 'Relayer + escrow',
      status: 'active',
      detail: 'Escrowing funds, posting job specs to IPFS, and broadcasting transactions.',
    };
  }

  if (stage === 'completed') {
    return {
      id: 'execution',
      title: 'Execution',
      caption: 'Relayer + escrow',
      status: 'complete',
      detail: 'Mission live. Receipts archived and ready for auditors.',
    };
  }

  return {
    id: 'execution',
    title: 'Execution',
    caption: 'Relayer + escrow',
    status: hasSimulation ? 'pending' : 'blocked',
    detail: hasSimulation
      ? 'Confirm once satisfied with the simulation to move capital trustlessly.'
      : 'Complete the simulation first to unlock unstoppable execution.',
  };
}

export function MissionPulse({
  stage,
  orchestratorReady,
  planError,
  simulateError,
  executeError,
  hasPlan,
  hasSimulation,
  statusSummary,
  runState,
}: MissionPulseProps) {
  const cards: PulseCard[] = [
    computePlanCard({ stage, orchestratorReady, hasPlan, planError }),
    computeSimulationCard({ stage, hasPlan, hasSimulation, simulateError }),
    computeExecutionCard({ stage, hasSimulation, executeError }),
  ];

  return (
    <section className="chat-pulse" aria-live="polite">
      <header className="chat-pulse-header">
        <h3 className="chat-pulse-title">Intelligence pulse</h3>
        <p className="chat-pulse-subtitle">
          Real-time orchestration status across planning, policy simulation, and unstoppable execution.
        </p>
      </header>
      <ul className="chat-pulse-grid" role="list">
        {cards.map((card) => (
          <li key={card.id} className="chat-pulse-item" role="listitem">
            <div className="chat-pulse-label">
              <span aria-hidden="true">{statusIcon[card.status]}</span>
              <span>
                {card.title}
                <span className="chat-pulse-caption"> · {card.caption}</span>
              </span>
            </div>
            <span className="chat-pulse-status" data-state={card.status}>
              {statusLabel[card.status]}
            </span>
            <p className="chat-pulse-detail">{card.detail}</p>
          </li>
        ))}
      </ul>
      {statusSummary ? (
        <p className="chat-pulse-footer">
          <strong>Run telemetry:</strong> {statusSummary}
        </p>
      ) : runState ? (
        <p className="chat-pulse-footer">
          <strong>Run telemetry:</strong> Mission state {runState}. Awaiting orchestrator updates.
        </p>
      ) : null}
    </section>
  );
}
