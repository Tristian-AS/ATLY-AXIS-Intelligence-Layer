/**
 * AxisChat — drop-in chat UI for a Lovable project.
 * Assumes shadcn/ui components are present (Lovable scaffolds these by default).
 *
 * Place this file at: src/components/AxisChat.tsx
 * Place use-axis.ts at: src/lib/axis.ts
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { axis } from "@/lib/axis";

// shadcn/ui imports — adjust paths if your project nests them differently.
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

export function AxisChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, live]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    let assembled = "";

    try {
      for await (const ev of axis.chatStream(text)) {
        if (ev.event === "delta") {
          assembled += ev.data.chunk;
          setLive(assembled);
        } else if (ev.event === "tool") {
          setMessages((m) => [
            ...m,
            {
              role: "tool",
              toolName: ev.data.name,
              content: ev.data.error ? `${ev.data.name} → ${ev.data.error}` : `${ev.data.name} ✓`,
            },
          ]);
        } else if (ev.event === "done") {
          setMessages((m) => [...m, { role: "assistant", content: ev.data.reply }]);
          setLive("");
        } else if (ev.event === "error") {
          setMessages((m) => [
            ...m,
            { role: "assistant", content: `Axis error: ${ev.data.message}` },
          ]);
          setLive("");
        }
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Network error: ${(err as Error).message}` },
      ]);
      setLive("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex h-[80vh] flex-col">
      <CardHeader className="border-b">
        <CardTitle className="font-light tracking-widest uppercase text-sm">
          Axis · the studio's operating brain
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 p-0">
        <ScrollArea className="flex-1 px-6 py-4">
          <div ref={scrollerRef} className="space-y-4">
            {messages.length === 0 && !live ? (
              <p className="text-sm text-muted-foreground">
                Tell Axis what's true. It decides what becomes memory, what becomes
                a project, what becomes money.
              </p>
            ) : null}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-muted px-4 py-2 text-sm">
                    {m.content}
                  </div>
                </div>
              ) : m.role === "tool" ? (
                <div key={i} className="flex">
                  <Badge variant="outline" className="font-mono text-xs">
                    {m.content}
                  </Badge>
                </div>
              ) : (
                <div key={i} className="flex">
                  <div className="max-w-[80%] whitespace-pre-wrap text-sm leading-relaxed">
                    {m.content}
                  </div>
                </div>
              )
            )}

            {live ? (
              <div className="flex">
                <div className="max-w-[80%] whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {live}
                  <span className="ml-1 animate-pulse">▍</span>
                </div>
              </div>
            ) : null}
          </div>
        </ScrollArea>

        <div className="flex items-end gap-2 border-t p-4">
          <Textarea
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
            className="min-h-[56px] flex-1 resize-none"
          />
          <Button onClick={send} disabled={busy || !input.trim()}>
            {busy ? "…" : "Send"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
