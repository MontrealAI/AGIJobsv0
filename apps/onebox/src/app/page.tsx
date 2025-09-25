"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

type Role = "user" | "assistant" | "system" | "assistant_pending";
export type ChatMessage = {
  role: Role;
  text: string;
  meta?: Record<string, unknown>;
};

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  text: "Hi! What would you like to do? (e.g., “Post a job to label 500 images for 50 AGIALPHA by next week.”)",
};

const ROLE_CLASSNAMES: Record<Role, string> = {
  user: styles.messageUser,
  assistant: styles.messageAssistant,
  system: styles.messageSystem,
  assistant_pending: styles.messagePending,
};

export default function OneBox() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [isBusy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || isBusy) return;
    const mine: ChatMessage = { role: "user", text: input.trim() };
    setMessages((prev) => [...prev, mine]);
    setInput("");
    setBusy(true);

    try {
      const historyPayload = messages.slice(-12).map(({ role, text, meta }) => ({
        role,
        text,
        meta,
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: mine.text,
          history: historyPayload,
        }),
      });

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      setMessages((prev) => [...prev, { role: "assistant_pending", text: "" }]);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        const partial = assistantText;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant_pending") {
            next[next.length - 1] = { ...last, text: partial };
          }
          return next;
        });
      }

      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant_pending") {
          next[next.length - 1] = { role: "assistant", text: last.text };
        }
        return next;
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unable to complete your request.";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Something went wrong: ${message}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  };

  const placeholder = useMemo(
    () => "“Post a job to label 500 images for 50 AGIALPHA by next week.”",
    []
  );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <strong>AGI Jobs</strong> — One-Box (gasless, walletless). <i>Type what you want to do.</i>
      </header>
      <div ref={scroller} className={styles.messages} role="log" aria-live="polite">
        {messages.map((message, index) => {
          const bubbleClass = ROLE_CLASSNAMES[message.role];
          return (
            <div key={`${message.role}-${index}`} className={`${styles.message} ${bubbleClass}`}>
              {message.text}
            </div>
          );
        })}
      </div>
      <form className={styles.inputRow} onSubmit={handleSubmit}>
        <input
          aria-label="Tell the orchestrator what you need"
          autoFocus
          className={styles.input}
          placeholder={placeholder}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button
          type="submit"
          className={styles.button}
          disabled={isBusy || !input.trim()}
        >
          {isBusy ? "Working…" : "Send"}
        </button>
      </form>
    </div>
  );
}
