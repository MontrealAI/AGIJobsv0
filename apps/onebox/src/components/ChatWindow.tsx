'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  parsePlanResponse,
  parseSimulationResponse,
  parseExecuteResponse,
  parseStatusResponse,
} from '@agijobs/onebox-sdk';
import type {
  ExecuteRequest,
  ExecuteResponse,
  PlanRequest,
  PlanResponse,
  SimulationResponse,
  StatusResponse,
} from '@agijobs/onebox-sdk';
import { defaultMessages } from '../lib/defaultMessages';
import { ReceiptsPanel } from './ReceiptsPanel';
import type { ExecutionReceipt } from './receiptTypes';

const ORCHESTRATOR_BASE_URL = (
  process.env.NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_URL ??
  process.env.NEXT_PUBLIC_ALPHA_ORCHESTRATOR_URL ??
  ''
).replace(/\/?$/, '');

const ORCHESTRATOR_TOKEN =
  process.env.NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_TOKEN ??
  process.env.NEXT_PUBLIC_ALPHA_ORCHESTRATOR_TOKEN ??
  '';

const RECEIPTS_STORAGE_KEY = 'onebox:receipts';
const RECEIPT_HISTORY_LIMIT = 5;
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 40;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown error';

type TextMessage = {
  id: string;
  role: 'user' | 'assistant';
  kind: 'text';
  content: string;
};

type PlanMessage = {
  id: string;
  role: 'assistant';
  kind: 'plan';
  plan: PlanResponse;
};

type SimulationMessage = {
  id: string;
  role: 'assistant';
  kind: 'simulation';
  simulation: SimulationResponse;
};

type StatusMessage = {
  id: string;
  role: 'assistant';
  kind: 'status';
  status: StatusResponse;
};

type ChatMessage = TextMessage | PlanMessage | SimulationMessage | StatusMessage;

type ChatStage =
  | 'idle'
  | 'planning'
  | 'planned'
  | 'simulating'
  | 'awaiting_execute'
  | 'executing'
  | 'completed'
  | 'error';

const createMessageId = () => crypto.randomUUID();

const mapStatusToReceipt = (status: StatusResponse): ExecutionReceipt | null => {
  const receipt = status.receipts;
  if (!receipt) {
    return null;
  }

  const firstCid = receipt.cids?.[0];
  const firstTx = receipt.txes?.[0];

  return {
    id: status.run.id,
    jobId: receipt.job_id ?? undefined,
    planHash: receipt.plan_id ?? status.run.plan_id,
    txHash: firstTx ?? undefined,
    txHashes: receipt.txes?.length ? receipt.txes : undefined,
    specCid: firstCid ?? undefined,
    createdAt: Date.now(),
    receiptCid: receipt.plan_id ?? undefined,
    reward: undefined,
    token: undefined,
    explorerUrl: undefined,
    netPayout: undefined,
  };
};

const formatSimulationSummary = (simulation: SimulationResponse) => {
  const budgetParts: string[] = [`Est. budget: ${simulation.estimatedBudget ?? '—'}`];
  const feeSegments: string[] = [];
  if (simulation.feeAmount) {
    feeSegments.push(
      `protocol fee ${simulation.feeAmount} AGIALPHA${
        simulation.feePct !== undefined && simulation.feePct !== null
          ? ` (${simulation.feePct}%)`
          : ''
      }`
    );
  } else if (simulation.feePct !== undefined && simulation.feePct !== null) {
    feeSegments.push(`protocol fee ${simulation.feePct}%`);
  }
  if (simulation.burnAmount) {
    feeSegments.push(
      `burn ${simulation.burnAmount} AGIALPHA${
        simulation.burnPct !== undefined && simulation.burnPct !== null
          ? ` (${simulation.burnPct}%)`
          : ''
      }`
    );
  } else if (simulation.burnPct !== undefined && simulation.burnPct !== null) {
    feeSegments.push(`burn ${simulation.burnPct}%`);
  }
  if (feeSegments.length > 0) {
    budgetParts.push(`Fee projections: ${feeSegments.join('; ')}`);
  }
  const lines = [`${budgetParts.join('. ')}.`];
  if (typeof simulation.est_duration === 'number') {
    lines.push(`Est. duration: ${simulation.est_duration} hour(s).`);
  }
  if (simulation.risks.length > 0) {
    lines.push(`Risks: ${simulation.risks.join(', ')}.`);
  }
  if (simulation.confirmations.length > 0) {
    lines.push(simulation.confirmations.join(' '));
  }
  return lines.join(' ');
};

const hasBlockingRisks = (simulation: SimulationResponse) =>
  simulation.blockers.length > 0 || simulation.risks.includes('OVER_BUDGET');

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>(
    defaultMessages as ChatMessage[]
  );
  const [input, setInput] = useState('');
  const [stage, setStage] = useState<ChatStage>('idle');
  const [planError, setPlanError] = useState<string | null>(null);
  const [simulateError, setSimulateError] = useState<string | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<PlanMessage | null>(null);
  const [activeSimulation, setActiveSimulation] = useState<SimulationMessage | null>(
    null
  );
  const [runStatusMessage, setRunStatusMessage] = useState<StatusMessage | null>(
    null
  );
  const [receipts, setReceipts] = useState<ExecutionReceipt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECEIPTS_STORAGE_KEY);
      if (!stored) {
        return;
      }
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) {
        return;
      }
      const valid = parsed.reduce<ExecutionReceipt[]>((acc, item) => {
        if (!item || typeof item !== 'object') {
          return acc;
        }
        const candidate = item as Partial<ExecutionReceipt>;
        if (!candidate.id || typeof candidate.id !== 'string') {
          return acc;
        }
        const createdAt =
          typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
            ? candidate.createdAt
            : Date.now();
        acc.push({
          id: candidate.id,
          jobId:
            typeof candidate.jobId === 'number' && Number.isFinite(candidate.jobId)
              ? candidate.jobId
              : undefined,
          planHash:
            typeof candidate.planHash === 'string' && candidate.planHash.length > 0
              ? candidate.planHash
              : undefined,
          txHash:
            typeof candidate.txHash === 'string' && candidate.txHash.length > 0
              ? candidate.txHash
              : undefined,
          txHashes: Array.isArray(candidate.txHashes)
            ? (candidate.txHashes.filter((value): value is string =>
                typeof value === 'string'
              ) as string[])
            : undefined,
          specCid:
            typeof candidate.specCid === 'string' && candidate.specCid.length > 0
              ? candidate.specCid
              : undefined,
          specUrl:
            typeof candidate.specUrl === 'string' && candidate.specUrl.length > 0
              ? candidate.specUrl
              : undefined,
          deliverableCid:
            typeof candidate.deliverableCid === 'string' &&
            candidate.deliverableCid.length > 0
              ? candidate.deliverableCid
              : undefined,
          deliverableUrl:
            typeof candidate.deliverableUrl === 'string' &&
            candidate.deliverableUrl.length > 0
              ? candidate.deliverableUrl
              : undefined,
          receiptCid:
            typeof candidate.receiptCid === 'string' && candidate.receiptCid.length > 0
              ? candidate.receiptCid
              : undefined,
          receiptUri:
            typeof candidate.receiptUri === 'string' && candidate.receiptUri.length > 0
              ? candidate.receiptUri
              : undefined,
          receiptGatewayUrls: Array.isArray(candidate.receiptGatewayUrls)
            ? (candidate.receiptGatewayUrls.filter((value): value is string =>
                typeof value === 'string'
              ) as string[])
            : undefined,
          netPayout:
            typeof candidate.netPayout === 'string' && candidate.netPayout.length > 0
              ? candidate.netPayout
              : undefined,
          explorerUrl:
            typeof candidate.explorerUrl === 'string' && candidate.explorerUrl.length > 0
              ? candidate.explorerUrl
              : undefined,
          reward:
            typeof candidate.reward === 'string' && candidate.reward.length > 0
              ? candidate.reward
              : undefined,
          token:
            typeof candidate.token === 'string' && candidate.token.length > 0
              ? candidate.token
              : undefined,
          createdAt,
        });
        return acc;
      }, []);
      setReceipts(valid);
    } catch (error) {
      console.error('Failed to restore receipts from storage.', error);
    }
  }, []);

  useEffect(() => {
    if (receipts.length === 0) {
      localStorage.removeItem(RECEIPTS_STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      RECEIPTS_STORAGE_KEY,
      JSON.stringify(receipts.slice(0, RECEIPT_HISTORY_LIMIT))
    );
  }, [receipts]);

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => [...current, message]);
  }, []);

  const addTextMessage = useCallback(
    (role: 'user' | 'assistant', content: string) => {
      const message: TextMessage = {
        id: createMessageId(),
        role,
        kind: 'text',
        content,
      };
      addMessage(message);
      return message;
    },
    [addMessage]
  );

  const callPlan = useCallback(async (payload: PlanRequest) => {
    if (!ORCHESTRATOR_BASE_URL) {
      throw new Error(
        'Set NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_URL to call the orchestrator.'
      );
    }
    const response = await fetch(`${ORCHESTRATOR_BASE_URL}/onebox/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ORCHESTRATOR_TOKEN
          ? { Authorization: `Bearer ${ORCHESTRATOR_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Plan failed with status ${response.status}`);
    }
    return parsePlanResponse(await response.json());
  }, []);

  const callSimulate = useCallback(async (plan: PlanResponse['plan']) => {
    if (!ORCHESTRATOR_BASE_URL) {
      throw new Error(
        'Set NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_URL to call the orchestrator.'
      );
    }
    const response = await fetch(`${ORCHESTRATOR_BASE_URL}/onebox/simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ORCHESTRATOR_TOKEN
          ? { Authorization: `Bearer ${ORCHESTRATOR_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ plan }),
    });
    if (!response.ok) {
      if (response.status === 422) {
        const detail = await response.json();
        const blockers = Array.isArray(detail?.blockers)
          ? detail.blockers.join(', ')
          : 'Blocked by guardrails.';
        throw new Error(blockers);
      }
      throw new Error(`Simulation failed with status ${response.status}`);
    }
    return parseSimulationResponse(await response.json());
  }, []);

  const callExecute = useCallback(async (plan: PlanResponse['plan']) => {
    if (!ORCHESTRATOR_BASE_URL) {
      throw new Error(
        'Set NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_URL to call the orchestrator.'
      );
    }
    const executePayload: ExecuteRequest = {
      plan,
      approvals: [],
    };
    const response = await fetch(`${ORCHESTRATOR_BASE_URL}/onebox/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ORCHESTRATOR_TOKEN
          ? { Authorization: `Bearer ${ORCHESTRATOR_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(executePayload),
    });
    if (!response.ok) {
      throw new Error(`Execution failed with status ${response.status}`);
    }
    return parseExecuteResponse(await response.json());
  }, []);

  const callStatus = useCallback(async (runId: string) => {
    if (!ORCHESTRATOR_BASE_URL) {
      throw new Error(
        'Set NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_URL to call the orchestrator.'
      );
    }
    const response = await fetch(
      `${ORCHESTRATOR_BASE_URL}/onebox/status?run_id=${encodeURIComponent(runId)}`,
      {
        method: 'GET',
        headers: {
          ...(ORCHESTRATOR_TOKEN
            ? { Authorization: `Bearer ${ORCHESTRATOR_TOKEN}` }
            : {}),
        },
      }
    );
    if (!response.ok) {
      throw new Error(`Status failed with status ${response.status}`);
    }
    return parseStatusResponse(await response.json());
  }, []);

  const pollStatus = useCallback(
    async (runId: string) => {
      let lastStatus: StatusResponse | null = null;
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
        try {
          const status = await callStatus(runId);
          lastStatus = status;
          if (!isMountedRef.current) {
            return;
          }
          const statusMessage: StatusMessage = {
            id: createMessageId(),
            role: 'assistant',
            kind: 'status',
            status,
          };
          setRunStatusMessage(statusMessage);
          setMessages((current) => [
            ...current.filter((message) => message.kind !== 'status'),
            statusMessage,
          ]);
          if (status.run.state === 'succeeded') {
            const receipt = mapStatusToReceipt(status);
            if (receipt) {
              setReceipts((current) => [receipt, ...current]);
            }
            setStage('completed');
            return;
          }
          if (status.run.state === 'failed') {
            setExecuteError('Run failed. Please inspect orchestrator logs.');
            setStage('error');
            return;
          }
        } catch (error) {
          console.error('Failed to fetch run status', error);
        }
        await delay(POLL_INTERVAL_MS);
      }
      if (lastStatus) {
        setExecuteError('Timed out waiting for run status.');
        setStage('error');
      }
    },
    [callStatus]
  );

  const submitMessage = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) {
        return;
      }
      addTextMessage('user', trimmed);
      setInput('');
      setIsLoading(true);
      setStage('planning');
      setPlanError(null);
      setSimulateError(null);
      setExecuteError(null);
      setActivePlan(null);
      setActiveSimulation(null);
      setRunStatusMessage(null);
      try {
        const planPayload: PlanRequest = {
          input_text: trimmed,
        };
        const result = await callPlan(planPayload);
        const planMessage: PlanMessage = {
          id: createMessageId(),
          role: 'assistant',
          kind: 'plan',
          plan: result,
        };
        addMessage(planMessage);
        setActivePlan(planMessage);
        if (result.missing_fields.length > 0) {
          const missingList = result.missing_fields.join(', ');
          addTextMessage(
            'assistant',
            `I still need the following details before I can simulate: ${missingList}.`
          );
          setStage('idle');
        } else {
          addTextMessage(
            'assistant',
            result.preview_summary || 'Plan ready. Run simulation to continue.'
          );
          setStage('planned');
        }
      } catch (error) {
        const message = toErrorMessage(error);
        addTextMessage('assistant', `⚠️ ${message}`);
        setPlanError(message);
        setStage('error');
      } finally {
        setIsLoading(false);
      }
    },
    [addMessage, addTextMessage, callPlan]
  );

  const handleSimulatePlan = useCallback(async () => {
    if (!activePlan) {
      return;
    }
    setStage('simulating');
    setSimulateError(null);
    try {
      const simulation = await callSimulate(activePlan.plan.plan);
      const message: SimulationMessage = {
        id: createMessageId(),
        role: 'assistant',
        kind: 'simulation',
        simulation,
      };
      addMessage(message);
      setActiveSimulation(message);
      addTextMessage('assistant', formatSimulationSummary(simulation));
      if (hasBlockingRisks(simulation)) {
        setSimulateError('Simulation flagged blockers. Adjust the plan and retry.');
        setStage('error');
        return;
      }
      setStage('awaiting_execute');
    } catch (error) {
      const message = toErrorMessage(error);
      addTextMessage('assistant', `⚠️ ${message}`);
      setSimulateError(message);
      setStage('error');
    }
  }, [activePlan, addMessage, addTextMessage, callSimulate]);

  const handleExecutePlan = useCallback(async () => {
    if (!activePlan) {
      return;
    }
    setStage('executing');
    setExecuteError(null);
    try {
      const execution = await callExecute(activePlan.plan.plan);
      addTextMessage(
        'assistant',
        `Execution started. Run ID: ${execution.run_id}. Monitoring progress…`
      );
      await pollStatus(execution.run_id);
    } catch (error) {
      const message = toErrorMessage(error);
      addTextMessage('assistant', `⚠️ ${message}`);
      setExecuteError(message);
      setStage('error');
    }
  }, [activePlan, addTextMessage, callExecute, pollStatus]);

  const pendingPlanId = activePlan?.id;
  const canSimulate = stage === 'planned' && !!activePlan;
  const canExecute = stage === 'awaiting_execute' && !!activePlan && !!activeSimulation;

  const statusSummary = useMemo(() => {
    if (!runStatusMessage) {
      return null;
    }
    const { status } = runStatusMessage;
    const state = status.run.state;
    const lines = [`Run ${status.run.id} is ${state}.`];
    if (status.current) {
      lines.push(`Current step: ${status.current}.`);
    }
    if (status.logs.length > 0) {
      lines.push(status.logs[status.logs.length - 1]);
    }
    return lines.join(' ');
  }, [runStatusMessage]);

  return (
    <div className="chat-wrapper">
      <div className="chat-shell">
        <div className="chat-history" role="log" aria-live="polite">
          {messages.map((message) => {
            if (message.kind === 'plan') {
              const summary =
                message.plan.preview_summary || 'Plan generated. Ready to simulate.';
              return (
                <div key={message.id} className="chat-message">
                  <span className="chat-message-role">{message.role}</span>
                  <div className="chat-bubble">
                    <div className="plan-summary">
                      <p>{summary}</p>
                      {message.plan.missing_fields.length > 0 ? (
                        <p>
                          Missing fields: {message.plan.missing_fields.join(', ')}
                        </p>
                      ) : null}
                      {pendingPlanId === message.id && canSimulate ? (
                        <div className="plan-actions">
                          <button
                            type="button"
                            className="plan-button"
                            onClick={() => {
                              void handleSimulatePlan();
                            }}
                            disabled={isLoading}
                          >
                            Simulate plan
                          </button>
                          <button
                            type="button"
                            className="plan-button plan-button-secondary"
                            onClick={() => {
                              setActivePlan(null);
                              setStage('idle');
                            }}
                            disabled={isLoading}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            }
            if (message.kind === 'simulation') {
              return (
                <div key={message.id} className="chat-message">
                  <span className="chat-message-role">{message.role}</span>
                  <div className="chat-bubble">
                    <div className="plan-summary">
                      <p>{formatSimulationSummary(message.simulation)}</p>
                      {pendingPlanId === activePlan?.id && message.id === activeSimulation?.id &&
                      canExecute ? (
                        <div className="plan-actions">
                          <button
                            type="button"
                            className="plan-button"
                            onClick={() => {
                              void handleExecutePlan();
                            }}
                            disabled={isLoading}
                          >
                            Execute plan
                          </button>
                          <button
                            type="button"
                            className="plan-button plan-button-secondary"
                            onClick={() => {
                              setActiveSimulation(null);
                              setStage('planned');
                            }}
                            disabled={isLoading}
                          >
                            Back
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            }
            if (message.kind === 'status') {
              return (
                <div key={message.id} className="chat-message">
                  <span className="chat-message-role">{message.role}</span>
                  <div className="chat-bubble">{statusSummary ?? 'Monitoring run…'}</div>
                </div>
              );
            }
            return (
              <div key={message.id} className="chat-message">
                <span className="chat-message-role">{message.role}</span>
                <div className="chat-bubble">{message.content}</div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        {planError ? (
          <div className="chat-error" role="alert">
            <span className="chat-error-message">{planError}</span>
          </div>
        ) : null}
        {simulateError ? (
          <div className="chat-error" role="alert">
            <span className="chat-error-message">{simulateError}</span>
          </div>
        ) : null}
        {executeError ? (
          <div className="chat-error" role="alert">
            <span className="chat-error-message">{executeError}</span>
          </div>
        ) : null}
        <form
          className="chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitMessage(input);
          }}
        >
          <label className="chat-label" htmlFor="onebox-input">
            Ask for anything
          </label>
          <div className="chat-input-row">
            <textarea
              id="onebox-input"
              rows={2}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Describe what you need done…"
              className="chat-textarea"
            />
            <button
              type="submit"
              disabled={isLoading || stage === 'executing'}
              className="chat-send-button"
            >
              {isLoading ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
      <ReceiptsPanel receipts={receipts} />
    </div>
  );
}
