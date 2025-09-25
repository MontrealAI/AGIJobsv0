"use client";

import { useEffect, useRef, useState } from "react";

type Role = "user" | "assistant" | "system" | "assistant_pending";

type Msg = {
  role: Role;
  text: string;
  meta?: Record<string, unknown>;
};

export default function OneBox() {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Hi! What would you like to do? (e.g., “Post a job to label 500 images for 50 AGIALPHA by next week.”)"
    }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo(0, scroller.current.scrollHeight);
  }, [msgs]);

  async function send() {
    if (!input.trim() || busy) return;
    const mine: Msg = { role: "user", text: input.trim() };
    setMsgs((m) => [...m, mine]);
    setInput("");
    setBusy(true);

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: mine.text, history: msgs.slice(-12) })
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let partial = "";

    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      partial += decoder.decode(value, { stream: true });
      setMsgs((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        if (last?.role === "assistant_pending") {
          next[next.length - 1] = { ...last, text: partial };
          return next;
        }
        return [...next, { role: "assistant_pending", text: partial }];
      });
    }

    setMsgs((m) => {
      const next = [...m];
      const last = next[next.length - 1];
      if (last?.role === "assistant_pending") {
        next[next.length - 1] = { role: "assistant", text: last.text };
        return next;
      }
      return next;
    });
    setBusy(false);
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b px-4 py-2 text-sm">
        <b>AGI Jobs</b> — One-Box (gasless, walletless). <i>Type what you want to do.</i>
      </header>
      <div ref={scroller} className="flex-1 space-y-3 overflow-auto bg-neutral-50 p-4">
        {msgs.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={`max-w-[70%] whitespace-pre-wrap rounded px-3 py-2 ${
              m.role === "user"
                ? "ml-auto bg-blue-600 text-white"
                : "bg-white text-neutral-900"
            } border`}
          >
            {m.text}
          </div>
        ))}
      </div>
      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          aria-label="Say anything"
          autoFocus
          className="flex-1 rounded border px-3 py-2"
          placeholder="“Post a job to label 500 images for 50 AGIALPHA by next week.”"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          disabled={busy || !input.trim()}
          type="submit"
        >
          {busy ? "Working…" : "Send"}
        </button>
      </form>
    </div>
  );
}
