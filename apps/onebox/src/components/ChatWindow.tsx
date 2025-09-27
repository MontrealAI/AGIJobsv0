'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlannerMessage } from '@agijobs/onebox-orchestrator';
import { defaultMessages } from '../lib/defaultMessages';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ApiResponse {
  reply: string;
  source: 'remote' | 'fallback';
  issues?: string[];
  confirmation?: {
    required: boolean;
    text?: string;
  };
}

const createMessageId = () => crypto.randomUUID();

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>(defaultMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submitMessage = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) {
        return;
      }

      const userMessage: ChatMessage = {
        id: createMessageId(),
        role: 'user',
        content: trimmed,
      };

      const plannerHistory: PlannerMessage[] = [...messages, userMessage].map((message) => ({
        role: message.role,
        content: message.content,
      }));

      setMessages((current) => [...current, userMessage]);
      setInput('');
      setIsLoading(true);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: plannerHistory }),
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as ApiResponse;

        const replyLines = [payload.reply];
        if (payload.confirmation?.required && payload.confirmation.text) {
          replyLines.push(`Confirmation needed: ${payload.confirmation.text}`);
        }
        if (payload.issues?.length) {
          replyLines.push(`Schema issues: ${payload.issues.join('; ')}`);
        }
        replyLines.push(`(planner source: ${payload.source})`);

        const assistantMessage: ChatMessage = {
          id: createMessageId(),
          role: 'assistant',
          content: replyLines.filter(Boolean).join('\n'),
        };

        setMessages((current) => [...current, assistantMessage]);
      } catch (error) {
        const assistantMessage: ChatMessage = {
          id: createMessageId(),
          role: 'assistant',
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
    [messages]
  );

  return (
    <div className="chat-shell">
      <div className="chat-history" role="log" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className="chat-message">
            <span className="chat-message-role">{message.role}</span>
            <div className="chat-bubble">{message.content}</div>
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
            disabled={isLoading}
            className="chat-send-button"
          >
            {isLoading ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
