'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ExecuteRequest,
  ExecuteResponse,
  PlanRequest,
  PlanResponse,
  PlannerHistoryMessage,
} from '@agijobs/onebox-sdk';
import deploymentAddresses from '../../../../docs/deployment-addresses.json';
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

type ChatMessage = TextMessage | PlanMessage;

type ChatStage =
  | 'idle'
  | 'planning'
  | 'planned'
  | 'awaiting_confirmation'
  | 'executing'
  | 'completed'
  | 'error';

const createMessageId = () => crypto.randomUUID();
const createReceiptId = () => crypto.randomUUID();
const RECEIPTS_STORAGE_KEY = 'onebox:receipts';
const RECEIPT_HISTORY_LIMIT = 5;

type ErrorPayload = { error: string };

const CONTRACT_ADDRESSES: Record<string, string> =
  deploymentAddresses as Record<string, string>;

const NETWORK_NAMES: Record<number, string> = {
  1: 'Ethereum Mainnet',
  5: 'Goerli',
  10: 'Optimism',
  56: 'BNB Smart Chain',
  137: 'Polygon',
  8453: 'Base',
  11155111: 'Sepolia',
};

const resolveNetworkName = (chainId: number) =>
  NETWORK_NAMES[chainId] ?? `Chain ${chainId}`;

const normalizeChainId = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const toErrorPayload = (error: unknown): ErrorPayload => ({
  error: error instanceof Error ? error.message : 'Unknown error',
});

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>(
    defaultMessages as ChatMessage[]
  );
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [stage, setStage] = useState<ChatStage>('idle');
  const [planError, setPlanError] = useState<string | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<{
    messageId: string;
    plan: PlanResponse;
  } | null>(null);
  const [receipts, setReceipts] = useState<ExecutionReceipt[]>([]);
  const [isExpertMode, setIsExpertMode] = useState(false);
  const [isExpertPanelOpen, setIsExpertPanelOpen] = useState(true);
  const [planRequestPayload, setPlanRequestPayload] =
    useState<PlanRequest | null>(null);
  const [planResponsePayload, setPlanResponsePayload] = useState<
    PlanResponse | ErrorPayload | null
  >(null);
  const [executeRequestPayload, setExecuteRequestPayload] =
    useState<ExecuteRequest | null>(null);
  const [executeResponsePayload, setExecuteResponsePayload] = useState<
    ExecuteResponse | ErrorPayload | null
  >(null);
  const [lastPlan, setLastPlan] = useState<PlanResponse | null>(null);
  const [lastExecute, setLastExecute] = useState<ExecuteResponse | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);

  useEffect(() => {
    messagesRef.current = messages;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isExpertMode) {
      setIsExpertPanelOpen(true);
    }
  }, [isExpertMode]);

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

        const legacyReward =
          typeof (candidate as { reward?: string }).reward === 'string' &&
          (candidate as { reward?: string }).reward
            ? (candidate as { reward?: string }).reward
            : undefined;
        const legacyToken =
          typeof (candidate as { token?: string }).token === 'string' &&
          (candidate as { token?: string }).token
            ? (candidate as { token?: string }).token
            : undefined;
        const storedNetPayout =
          typeof candidate.netPayout === 'string' &&
          candidate.netPayout.length > 0
            ? candidate.netPayout
            : undefined;
        const derivedNetPayout = legacyReward
          ? legacyToken
            ? `${legacyReward} ${legacyToken}`
            : legacyReward
          : undefined;
        const { receiptUrl: receiptUrlCandidate } = candidate as {
          receiptUrl?: unknown;
        };
        const legacyExplorerUrl =
          typeof receiptUrlCandidate === 'string' &&
          receiptUrlCandidate.length > 0
            ? receiptUrlCandidate
            : undefined;
        const resolvedExplorerUrl =
          typeof candidate.explorerUrl === 'string' &&
          candidate.explorerUrl.length > 0
            ? candidate.explorerUrl
            : legacyExplorerUrl;

        const record: ExecutionReceipt = {
          id: candidate.id,
          jobId:
            typeof candidate.jobId === 'number' ? candidate.jobId : undefined,
          specCid:
            typeof candidate.specCid === 'string' &&
            candidate.specCid.length > 0
              ? candidate.specCid
              : undefined,
          netPayout: storedNetPayout ?? derivedNetPayout,
          explorerUrl: resolvedExplorerUrl,
          createdAt:
            typeof candidate.createdAt === 'number'
              ? candidate.createdAt
              : Date.now(),
        };

        acc.push(record);
        return acc;
      }, []);

      if (valid.length > 0) {
        valid.sort((a, b) => b.createdAt - a.createdAt);
        const limited = valid.slice(0, RECEIPT_HISTORY_LIMIT);
        setReceipts(limited);
      }
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

  const buildPlannerHistory = useCallback(
    (sourceMessages?: ChatMessage[]): PlannerHistoryMessage[] => {
      const base = sourceMessages ?? messagesRef.current;

      return base
        .map<PlannerHistoryMessage>((message) => {
          if (message.kind === 'plan') {
            return {
              role: 'assistant',
              content: message.plan.summary,
            };
          }

          return {
            role: message.role,
            content: message.content,
          };
        })
        .filter((entry) => entry.content.trim().length > 0);
    },
    [messagesRef]
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
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as PlanResponse;
  }, []);

  const presentPlanResponse = useCallback((payload: PlanResponse) => {
    const planMessageId = createMessageId();
    const assistantMessage: PlanMessage = {
      id: planMessageId,
      role: 'assistant',
      kind: 'plan',
      plan: payload,
    };

    setMessages((current) => [...current, assistantMessage]);
    setPlanResponsePayload(payload);
    setLastPlan(payload);
    setPlanError(null);
    setExecuteError(null);
    setStage('planned');

    if (payload.requiresConfirmation === false) {
      setPendingPlan(null);
    } else {
      setPendingPlan({ messageId: planMessageId, plan: payload });
      setStage('awaiting_confirmation');
    }

    return planMessageId;
  }, []);

  const handlePlanFailure = useCallback((error: unknown) => {
    const payload = toErrorPayload(error);
    setPlanResponsePayload(payload);
    setLastPlan(null);
    setPendingPlan(null);

    const message =
      error instanceof Error
        ? error.message
        : 'Something went wrong. Please try again.';

    const assistantMessage: TextMessage = {
      id: createMessageId(),
      role: 'assistant',
      kind: 'text',
      content: `⚠️ ${message}`,
    };

    setMessages((current) => [...current, assistantMessage]);
    setPlanError(message);
    setStage('error');
  }, []);

  const submitMessage = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) {
        return;
      }

      const userMessage: TextMessage = {
        id: createMessageId(),
        role: 'user',
        kind: 'text',
        content: trimmed,
      };

      const history = buildPlannerHistory([
        ...messagesRef.current,
        userMessage,
      ]);

      const planPayload: PlanRequest = {
        text: trimmed,
        expert: isExpertMode,
        history,
      };

      setMessages((current) => [...current, userMessage]);
      setInput('');
      setIsLoading(true);
      setPendingPlan(null);
      setPlanRequestPayload(planPayload);
      setPlanResponsePayload(null);
      setExecuteRequestPayload(null);
      setExecuteResponsePayload(null);
      setLastPlan(null);
      setLastExecute(null);
      setPlanError(null);
      setExecuteError(null);
      setStage('planning');

      try {
        const payload = await callPlan(planPayload);
        presentPlanResponse(payload);
      } catch (error) {
        handlePlanFailure(error);
      } finally {
        setIsLoading(false);
      }
    },
    [
      buildPlannerHistory,
      callPlan,
      handlePlanFailure,
      isExpertMode,
      presentPlanResponse,
    ]
  );

  const retryPlan = useCallback(async () => {
    if (!planRequestPayload) {
      return;
    }

    const history = buildPlannerHistory(messagesRef.current);
    const payload: PlanRequest = {
      ...planRequestPayload,
      history,
    };

    setPlanRequestPayload(payload);
    setPlanResponsePayload(null);
    setExecuteRequestPayload(null);
    setExecuteResponsePayload(null);
    setLastPlan(null);
    setLastExecute(null);
    setPendingPlan(null);
    setPlanError(null);
    setExecuteError(null);
    setIsLoading(true);
    setStage('planning');

    try {
      const response = await callPlan(payload);
      presentPlanResponse(response);
    } catch (error) {
      handlePlanFailure(error);
    } finally {
      setIsLoading(false);
    }
  }, [
    buildPlannerHistory,
    callPlan,
    handlePlanFailure,
    messagesRef,
    planRequestPayload,
    presentPlanResponse,
  ]);

  const handleCancelPlanError = useCallback(() => {
    setPlanError(null);
    setStage('idle');
  }, []);

  const updateMessageContent = useCallback((id: string, content: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === id && message.kind === 'text'
          ? {
              ...message,
              content,
            }
          : message
      )
    );
  }, []);

  const handleRejectPlan = useCallback(() => {
    if (!pendingPlan) {
      return;
    }

    setPendingPlan(null);
    setPlanError(null);
    setExecuteError(null);
    setStage('completed');
    const assistantMessage: TextMessage = {
      id: createMessageId(),
      role: 'assistant',
      kind: 'text',
      content: 'Understood. Adjust your request when you are ready.',
    };

    setMessages((current) => [...current, assistantMessage]);
  }, [pendingPlan]);

  const extractExecutePayload = (raw: string): ExecuteResponse => {
    const segments = raw
      .split(/\r?\n/)
      .map((segment) => segment.replace(/^data:\s*/, '').trim())
      .filter(Boolean)
      .reverse();

    for (const segment of segments) {
      try {
        return JSON.parse(segment) as ExecuteResponse;
      } catch {
        // Try the next segment.
      }
    }

    throw new Error('Execution response did not include valid JSON payload.');
  };

  const handleExecutePlan = useCallback(async () => {
    if (!pendingPlan) {
      return;
    }

    if (!ORCHESTRATOR_BASE_URL) {
      const message =
        'Execution requires NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_URL to be configured.';
      const assistantMessage: TextMessage = {
        id: createMessageId(),
        role: 'assistant',
        kind: 'text',
        content: `⚠️ ${message}`,
      };
      setMessages((current) => [...current, assistantMessage]);
      setExecuteError(message);
      setStage('error');
      return;
    }

    const planContext = pendingPlan;
    setPendingPlan(null);
    setExecuteError(null);
    setPlanError(null);
    setIsExecuting(true);
    setStage('executing');

    const progressMessageId = createMessageId();
    const progressMessage: TextMessage = {
      id: progressMessageId,
      role: 'assistant',
      kind: 'text',
      content: 'Working on it •',
    };

    setMessages((current) => [...current, progressMessage]);

    const executeRequestPayload: ExecuteRequest = {
      intent: planContext.plan.intent,
      mode: 'relayer',
    };
    setExecuteRequestPayload(executeRequestPayload);
    setExecuteResponsePayload(null);
    let parsedExecuteResponse: ExecuteResponse | null = null;

    try {
      const response = await fetch(`${ORCHESTRATOR_BASE_URL}/onebox/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ORCHESTRATOR_TOKEN
            ? { Authorization: `Bearer ${ORCHESTRATOR_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(executeRequestPayload),
      });

      let raw = '';
      let dots = 0;

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          raw += decoder.decode(value, { stream: true });
          dots = (dots + 1) % 3;
          const suffix = ' •'.repeat(dots + 1);
          updateMessageContent(progressMessageId, `Working on it${suffix}`);
        }
        raw += decoder.decode();
      } else {
        raw = await response.text();
      }

      const payload = extractExecutePayload(raw);

      parsedExecuteResponse = payload;
      setExecuteResponsePayload(payload);

      if (!response.ok || !payload.ok) {
        const reason = payload.error ?? `Execution failed (${response.status})`;
        throw new Error(reason);
      }

      const netPayout = [payload.reward, payload.token]
        .filter(
          (value): value is string =>
            typeof value === 'string' && value.length > 0
        )
        .join(' ');

      const receipt: ExecutionReceipt = {
        id: createReceiptId(),
        jobId: payload.jobId,
        specCid: payload.specCid,
        netPayout: netPayout.length > 0 ? netPayout : undefined,
        explorerUrl: payload.receiptUrl,
        createdAt: Date.now(),
      };

      const successLines = ['✅ Success.'];
      if (receipt.jobId !== undefined) {
        successLines.push(`Job ID: ${receipt.jobId}`);
      }
      if (receipt.specCid) {
        successLines.push(`CID: ${receipt.specCid}`);
      }
      if (receipt.netPayout) {
        successLines.push(`Payout: ${receipt.netPayout}`);
      }
      if (receipt.explorerUrl) {
        successLines.push(`Receipt: ${receipt.explorerUrl}`);
      }

      setReceipts((current) => {
        const next = [receipt, ...current];
        return next.slice(0, RECEIPT_HISTORY_LIMIT);
      });
      updateMessageContent(progressMessageId, successLines.join('\n'));
      setStage('completed');
    } catch (error) {
      if (parsedExecuteResponse === null) {
        setExecuteResponsePayload(toErrorPayload(error));
      }
      const message =
        error instanceof Error
          ? error.message
          : 'Execution failed. Please try again.';
      updateMessageContent(progressMessageId, `⚠️ ${message}`);
      setExecuteError(message);
      setPendingPlan(planContext);
      setStage('awaiting_confirmation');
    } finally {
      setLastExecute(parsedExecuteResponse);
      setIsExecuting(false);
    }
  }, [pendingPlan, updateMessageContent]);

  const handleRetryExecute = useCallback(() => {
    setExecuteError(null);
    void handleExecutePlan();
  }, [handleExecutePlan]);

  const handleCancelExecuteError = useCallback(() => {
    setExecuteError(null);
    setPendingPlan(null);
    setStage('completed');
  }, []);

  const contractEntries = useMemo(
    () =>
      Object.entries(CONTRACT_ADDRESSES).filter(
        ([key, value]) => key !== '_comment' && typeof value === 'string'
      ),
    []
  );

  const expertChainId = useMemo(() => {
    const executeChainId = normalizeChainId(lastExecute?.chainId);
    if (executeChainId !== undefined) {
      return executeChainId;
    }

    const payloadChainId = normalizeChainId(lastPlan?.intent?.payload?.chainId);
    if (payloadChainId !== undefined) {
      return payloadChainId;
    }

    return undefined;
  }, [lastExecute, lastPlan]);

  const networkLabel = expertChainId
    ? `${resolveNetworkName(expertChainId)} (${expertChainId})`
    : 'Not available';

  return (
    <div className="chat-wrapper">
      <div className="chat-shell">
        <div className="chat-toolbar">
          <button
            type="button"
            className={`expert-toggle${isExpertMode ? ' is-active' : ''}`}
            onClick={() => {
              setIsExpertMode((current) => !current);
            }}
            aria-pressed={isExpertMode}
          >
            {isExpertMode ? 'Expert mode: on' : 'Expert mode: off'}
          </button>
        </div>
        {isExpertMode ? (
          <div className="expert-panel">
            <div className="expert-panel-header">
              <p className="expert-panel-title">Expert insights</p>
              <button
                type="button"
                className="expert-panel-toggle"
                onClick={() => {
                  setIsExpertPanelOpen((current) => !current);
                }}
                aria-expanded={isExpertPanelOpen}
              >
                {isExpertPanelOpen ? 'Hide' : 'Show'}
              </button>
            </div>
            {isExpertPanelOpen ? (
              <div className="expert-panel-body">
                <div className="expert-meta">
                  <div className="expert-meta-field">
                    <span className="expert-meta-label">Network</span>
                    <span className="expert-meta-value">{networkLabel}</span>
                  </div>
                  <div className="expert-meta-field">
                    <span className="expert-meta-label">Stage</span>
                    <span className="expert-meta-value">{stage}</span>
                  </div>
                </div>
                <div className="expert-contracts">
                  <span className="expert-section-title">
                    Contract addresses
                  </span>
                  <ul className="expert-contracts-list">
                    {contractEntries.map(([key, value]) => (
                      <li key={key} className="expert-contract-item">
                        <span className="expert-contract-name">{key}</span>
                        <code className="expert-contract-address">{value}</code>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="expert-json-grid">
                  <div>
                    <span className="expert-section-title">Plan request</span>
                    <pre className="expert-json-block">
                      {planRequestPayload
                        ? JSON.stringify(planRequestPayload, null, 2)
                        : 'No plan request yet.'}
                    </pre>
                  </div>
                  <div>
                    <span className="expert-section-title">Plan response</span>
                    <pre className="expert-json-block">
                      {planResponsePayload
                        ? JSON.stringify(planResponsePayload, null, 2)
                        : 'No plan response yet.'}
                    </pre>
                  </div>
                  <div>
                    <span className="expert-section-title">
                      Execute request
                    </span>
                    <pre className="expert-json-block">
                      {executeRequestPayload
                        ? JSON.stringify(executeRequestPayload, null, 2)
                        : 'No execute request yet.'}
                    </pre>
                  </div>
                  <div>
                    <span className="expert-section-title">
                      Execute response
                    </span>
                    <pre className="expert-json-block">
                      {executeResponsePayload
                        ? JSON.stringify(executeResponsePayload, null, 2)
                        : 'No execute response yet.'}
                    </pre>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="chat-history" role="log" aria-live="polite">
          {messages.map((message) => {
            if (message.kind === 'plan') {
              const warnings = Array.isArray(message.plan.warnings)
                ? message.plan.warnings
                : [];
              const hasWarnings = warnings.length > 0;

              return (
                <div key={message.id} className="chat-message">
                  <span className="chat-message-role">{message.role}</span>
                  <div className="chat-bubble">
                    <div className="plan-summary">
                      <p>{message.plan.summary}</p>
                      {hasWarnings ? (
                        <ul className="plan-warnings">
                          {warnings.map((warning: string, warningIndex: number) => (
                            <li key={warningIndex}>{warning}</li>
                          ))}
                        </ul>
                      ) : null}
                      {pendingPlan?.messageId === message.id ? (
                        <div className="plan-actions">
                          <button
                            type="button"
                            className="plan-button"
                            onClick={() => {
                              void handleExecutePlan();
                            }}
                            disabled={isExecuting}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            className="plan-button plan-button-secondary"
                            onClick={handleRejectPlan}
                            disabled={isExecuting}
                          >
                            No
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
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
            <div className="chat-error-actions">
              <button
                type="button"
                className="chat-error-button"
                onClick={() => {
                  void retryPlan();
                }}
                disabled={isLoading || isExecuting}
              >
                Retry
              </button>
              <button
                type="button"
                className="chat-error-button chat-error-button-secondary"
                onClick={handleCancelPlanError}
                disabled={isExecuting}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {executeError ? (
          <div className="chat-error" role="alert">
            <span className="chat-error-message">{executeError}</span>
            <div className="chat-error-actions">
              <button
                type="button"
                className="chat-error-button"
                onClick={handleRetryExecute}
                disabled={isExecuting}
              >
                Retry
              </button>
              <button
                type="button"
                className="chat-error-button chat-error-button-secondary"
                onClick={handleCancelExecuteError}
                disabled={isExecuting}
              >
                Cancel
              </button>
            </div>
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
              disabled={isLoading || isExecuting}
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
