'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ExecuteRequest,
  ExecuteResponse,
  PlanRequest,
  PlanResponse,
} from '@agijobs/onebox-sdk';
import deploymentAddresses from '../../../../docs/deployment-addresses.json';
import { defaultMessages } from '../lib/defaultMessages';

const ORCHESTRATOR_BASE_URL = (
  process.env.NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_URL ??
  process.env.NEXT_PUBLIC_ALPHA_ORCHESTRATOR_URL ??
  ''
).replace(/\/?$/, '');

const ORCHESTRATOR_TOKEN =
  process.env.NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_TOKEN ??
  process.env.NEXT_PUBLIC_ALPHA_ORCHESTRATOR_TOKEN ??
  '';

type ExecutionReceipt = {
  id: string;
  jobId?: number;
  specCid?: string;
  reward?: string;
  token?: string;
  receiptUrl?: string;
  createdAt: number;
};

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
  const [pendingPlan, setPendingPlan] = useState<{
    messageId: string;
    plan: PlanResponse;
  } | null>(null);
  const [latestReceipt, setLatestReceipt] = useState<ExecutionReceipt | null>(
    null
  );
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

  useEffect(() => {
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

        const record: ExecutionReceipt = {
          id: candidate.id,
          jobId:
            typeof candidate.jobId === 'number' ? candidate.jobId : undefined,
          specCid:
            typeof candidate.specCid === 'string' &&
            candidate.specCid.length > 0
              ? candidate.specCid
              : undefined,
          reward:
            typeof candidate.reward === 'string' && candidate.reward.length > 0
              ? candidate.reward
              : undefined,
          token:
            typeof candidate.token === 'string' && candidate.token.length > 0
              ? candidate.token
              : undefined,
          receiptUrl:
            typeof candidate.receiptUrl === 'string' &&
            candidate.receiptUrl.length > 0
              ? candidate.receiptUrl
              : undefined,
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
        setLatestReceipt(limited[0] ?? null);
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

  useEffect(() => {
    if (receipts.length === 0) {
      if (latestReceipt !== null) {
        setLatestReceipt(null);
      }
      return;
    }

    const [first] = receipts;
    if (!latestReceipt || latestReceipt.id !== first.id) {
      setLatestReceipt(first);
    }
  }, [latestReceipt, receipts]);

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

      setMessages((current) => [...current, userMessage]);
      setInput('');
      setIsLoading(true);
      setPendingPlan(null);

      const planRequestPayload: PlanRequest = {
        text: trimmed,
        expert: isExpertMode,
      };
      setPlanRequestPayload(planRequestPayload);
      setPlanResponsePayload(null);
      setExecuteRequestPayload(null);
      setExecuteResponsePayload(null);
      setLastPlan(null);
      setLastExecute(null);

      try {
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
          body: JSON.stringify(planRequestPayload),
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as PlanResponse;
        setPlanResponsePayload(payload);
        setLastPlan(payload);

        const planMessageId = createMessageId();
        const assistantMessage: PlanMessage = {
          id: planMessageId,
          role: 'assistant',
          kind: 'plan',
          plan: payload,
        };

        setMessages((current) => [...current, assistantMessage]);
        setPendingPlan({ messageId: planMessageId, plan: payload });
      } catch (error) {
        setPlanResponsePayload(toErrorPayload(error));
        setLastPlan(null);
        const assistantMessage: TextMessage = {
          id: createMessageId(),
          role: 'assistant',
          kind: 'text',
          content:
            error instanceof Error
              ? `Something went wrong: ${error.message}`
              : 'Something went wrong. Please try again.',
        };

        setMessages((current) => [...current, assistantMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [isExpertMode]
  );

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
      const assistantMessage: TextMessage = {
        id: createMessageId(),
        role: 'assistant',
        kind: 'text',
        content:
          'Execution requires NEXT_PUBLIC_ONEBOX_ORCHESTRATOR_URL to be configured.',
      };
      setMessages((current) => [...current, assistantMessage]);
      return;
    }

    const { plan } = pendingPlan;
    setPendingPlan(null);
    setIsExecuting(true);

    const progressMessageId = createMessageId();
    const progressMessage: TextMessage = {
      id: progressMessageId,
      role: 'assistant',
      kind: 'text',
      content: 'Working on it…',
    };

    setMessages((current) => [...current, progressMessage]);

    const executeRequestPayload: ExecuteRequest = {
      intent: plan.intent,
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
          dots = (dots + 1) % 4;
          const suffix = '.'.repeat(dots === 0 ? 3 : dots);
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

      const receipt: ExecutionReceipt = {
        id: createReceiptId(),
        jobId: payload.jobId,
        specCid: payload.specCid,
        reward: payload.reward,
        token: payload.token,
        receiptUrl: payload.receiptUrl,
        createdAt: Date.now(),
      };

      const successLines = ['✅ Success.'];
      if (receipt.jobId !== undefined) {
        successLines.push(`Job ID: ${receipt.jobId}`);
      }
      if (receipt.specCid) {
        successLines.push(`CID: ${receipt.specCid}`);
      }
      if (receipt.reward) {
        const payoutLabel = receipt.token
          ? `${receipt.reward} ${receipt.token}`
          : receipt.reward;
        successLines.push(`Payout: ${payoutLabel}`);
      }
      if (receipt.receiptUrl) {
        successLines.push(`Receipt: ${receipt.receiptUrl}`);
      }

      setLatestReceipt(receipt);
      setReceipts((current) => {
        const next = [receipt, ...current];
        return next.slice(0, RECEIPT_HISTORY_LIMIT);
      });
      updateMessageContent(progressMessageId, successLines.join('\n'));
    } catch (error) {
      if (parsedExecuteResponse === null) {
        setExecuteResponsePayload(toErrorPayload(error));
      }
      const message =
        error instanceof Error
          ? error.message
          : 'Execution failed. Please try again.';
      updateMessageContent(progressMessageId, `⚠️ ${message}`);
    } finally {
      setLastExecute(parsedExecuteResponse);
      setIsExecuting(false);
    }
  }, [isExpertMode, pendingPlan, updateMessageContent]);

  const formatPayout = (receipt: ExecutionReceipt) => {
    if (receipt.reward && receipt.token) {
      return `${receipt.reward} ${receipt.token}`;
    }
    return receipt.reward ?? null;
  };

  const contractEntries = useMemo(
    () =>
      Object.entries(CONTRACT_ADDRESSES).filter(
        ([key, value]) => key !== '_comment' && typeof value === 'string'
      ),
    []
  );

  const expertChainId = useMemo(() => {
    if (lastExecute && typeof lastExecute.chainId === 'number') {
      return lastExecute.chainId;
    }

    const candidate = lastPlan?.intent?.payload?.chainId;
    if (typeof candidate === 'number') {
      return candidate;
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
          {messages.map((message) => (
            <div key={message.id} className="chat-message">
              <span className="chat-message-role">{message.role}</span>
              <div className="chat-bubble">
                {message.kind === 'plan' ? (
                  <div className="plan-summary">
                    <p>{message.plan.summary}</p>
                    {message.plan.warnings &&
                    message.plan.warnings.length > 0 ? (
                      <ul className="plan-warnings">
                        {message.plan.warnings.map(
                          (warning: string, warningIndex: number) => (
                            <li key={warningIndex}>{warning}</li>
                          )
                        )}
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
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
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
      <aside
        className="chat-receipts"
        aria-live="polite"
        aria-label="Recent receipts"
      >
        <h2 className="chat-receipts-title">Recent jobs</h2>
        {latestReceipt ? (
          <ul className="chat-receipts-list">
            {receipts.map((receipt) => {
              const payout = formatPayout(receipt);
              return (
                <li key={receipt.id} className="chat-receipts-item">
                  {receipt.jobId !== undefined ? (
                    <div className="chat-receipt-field">
                      <span className="chat-receipt-label">Job ID</span>
                      <span className="chat-receipt-value">
                        #{receipt.jobId}
                      </span>
                    </div>
                  ) : null}
                  {receipt.specCid ? (
                    <div className="chat-receipt-field">
                      <span className="chat-receipt-label">CID</span>
                      <span className="chat-receipt-value chat-receipt-monospace">
                        {receipt.specCid}
                      </span>
                    </div>
                  ) : null}
                  {payout ? (
                    <div className="chat-receipt-field">
                      <span className="chat-receipt-label">Payout</span>
                      <span className="chat-receipt-value">{payout}</span>
                    </div>
                  ) : null}
                  {receipt.receiptUrl ? (
                    <a
                      className="chat-receipt-link"
                      href={receipt.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on explorer
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="chat-receipts-empty">
            Execute a plan to see job details here.
          </p>
        )}
      </aside>
    </div>
  );
}
