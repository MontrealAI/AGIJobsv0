'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExecuteResponse, PlanResponse } from '@agijobs/onebox-sdk';
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
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submitMessage = useCallback(async (prompt: string) => {
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
        body: JSON.stringify({ text: trimmed }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as PlanResponse;

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

    try {
      const response = await fetch(`${ORCHESTRATOR_BASE_URL}/onebox/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ORCHESTRATOR_TOKEN
            ? { Authorization: `Bearer ${ORCHESTRATOR_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({ intent: plan.intent, mode: 'relayer' }),
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

      if (!response.ok || !payload.ok) {
        const reason = payload.error ?? `Execution failed (${response.status})`;
        throw new Error(reason);
      }

      const successLines = ['✅ Success.'];
      if (payload.jobId !== undefined) {
        successLines.push(`Job ID: ${payload.jobId}`);
      }
      if (payload.receiptUrl) {
        successLines.push(`Receipt: ${payload.receiptUrl}`);
      }
      updateMessageContent(progressMessageId, successLines.join('\n'));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Execution failed. Please try again.';
      updateMessageContent(progressMessageId, `⚠️ ${message}`);
    } finally {
      setIsExecuting(false);
    }
  }, [pendingPlan, updateMessageContent]);

  return (
    <div className="chat-shell">
      <div className="chat-history" role="log" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className="chat-message">
            <span className="chat-message-role">{message.role}</span>
            <div className="chat-bubble">
              {message.kind === 'plan' ? (
                <div className="plan-summary">
                  <p>{message.plan.summary}</p>
                  {message.plan.warnings && message.plan.warnings.length > 0 ? (
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
  );
}
