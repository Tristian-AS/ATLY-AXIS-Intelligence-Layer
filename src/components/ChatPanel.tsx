"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

interface StoredMessage {
  id: string;
  role: string;
  content: string;
  toolName?: string | null;
  toolInput?: string | null;
  toolOutput?: string | null;
  createdAt: string | Date;
}

interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  toolPayload?: string;
}

function normalize(m: StoredMessage): DisplayMessage {
  return {
    id: m.id,
    role: m.role as DisplayMessage["role"],
    content: m.content,
    toolName: m.toolName ?? undefined,
    toolPayload: m.toolOutput ?? undefined,
  };
}

export function ChatPanel({ initialMessages }: { initialMessages: StoredMessage[] }) {
  const params = useSearchParams();
  const seed = params.get("seed");

  const [messages, setMessages] = useState<DisplayMessage[]>(initialMessages.map(normalize));
  const [input, setInput] = useState(seed ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const visible = useMemo(
    () => messages.filter((m) => m.role !== "tool" || m.toolName),
    [messages]
  );

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    setSending(true);
    const optimistic: DisplayMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");

    try {
      const res = await fetch("/api/axis/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Axis returned ${res.status}`);
      }
      const data = (await res.json()) as {
        reply: string;
        toolActivity: Array<{ name: string; output: unknown; error?: string }>;
      };

      const toolNotes: DisplayMessage[] = data.toolActivity.map((t, i) => ({
        id: `tool-${Date.now()}-${i}`,
        role: "tool",
        content: t.error ? `${t.name} → ${t.error}` : `${t.name} ✓`,
        toolName: t.name,
        toolPayload: JSON.stringify(t.output, null, 2),
      }));

      const assistant: DisplayMessage = {
        id: `asst-${Date.now()}`,
        role: "assistant",
        content: data.reply,
      };

      setMessages((prev) => [...prev, ...toolNotes, assistant]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-220px)] flex-col rounded-lg border border-ink-700/60 bg-ink-900/30 shadow-film">
      <div
        ref={scrollerRef}
        className="flex-1 space-y-5 overflow-y-auto px-8 py-8"
      >
        {visible.length === 0 ? (
          <Welcome onPick={(p) => setInput(p)} />
        ) : (
          visible.map((m) => <MessageRow key={m.id} m={m} />)
        )}
      </div>

      {error ? (
        <div className="border-t border-flag-danger/40 bg-flag-danger/10 px-8 py-3 text-xs text-flag-danger">
          {error}
        </div>
      ) : null}

      <div className="border-t border-ink-700/60 bg-ink-950/60 px-6 py-4">
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Tell Axis something. ⌘↵ to send."
            className="min-h-[52px] flex-1 resize-none rounded-md border border-ink-700/60 bg-ink-900/80 px-4 py-3 text-sm text-ink-100 placeholder:text-ink-400 focus:border-signal-accent/60 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="rounded-md border border-signal-accent/40 bg-signal-accent/10 px-5 py-3 text-xs uppercase tracking-[0.25em] text-signal-accent transition hover:bg-signal-accent/20 disabled:opacity-40"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageRow({ m }: { m: DisplayMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg rounded-tr-sm border border-ink-700/60 bg-ink-800/60 px-4 py-3 text-sm text-ink-100">
          {m.content}
        </div>
      </div>
    );
  }
  if (m.role === "tool") {
    return (
      <details className="rounded-md border atly-hairline bg-ink-950/40 px-3 py-2 text-xs text-ink-300">
        <summary className="cursor-pointer select-none uppercase tracking-[0.25em] text-ink-400">
          <span className="text-signal-accent">tool</span> · {m.toolName}
        </summary>
        {m.toolPayload ? (
          <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-[11px] text-ink-300">
            {m.toolPayload}
          </pre>
        ) : null}
      </details>
    );
  }
  return (
    <div className="flex">
      <div className="mr-3 mt-2 text-[10px] uppercase tracking-[0.35em] text-signal-accent">
        axis
      </div>
      <div className="max-w-[80%] whitespace-pre-wrap text-sm leading-relaxed text-signal">
        {m.content}
      </div>
    </div>
  );
}

const STARTERS = [
  "What should I focus on today?",
  "Which clients need attention?",
  "What should I set aside for taxes?",
  "Draft an invoice for Rhøme — $8,500 for the brand film deposit.",
  "Generate a campaign plan for Rhøme around tactile slow-luxury.",
];

function Welcome({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="text-[10px] uppercase tracking-[0.5em] text-signal-accent">Axis online</div>
      <h2 className="mt-4 font-display text-3xl tracking-tight text-signal">
        Tell me what's true.
      </h2>
      <p className="mt-3 max-w-md text-sm text-ink-300">
        Anything important you say — clients, money, lessons, shoots — Axis decides where it
        belongs and stores it.
      </p>
      <div className="mt-8 flex flex-col gap-2">
        {STARTERS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-md border border-ink-700/60 px-4 py-2 text-left text-sm text-ink-200 transition hover:border-signal-accent/40 hover:text-signal"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
