import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, AXIS_MODEL, AXIS_SYSTEM_PROMPT } from "@/lib/anthropic";
import { AXIS_TOOLS, runTool } from "@/lib/tools";
import { db } from "@/lib/prisma";
import { protect } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Claude tool-use loops routinely run 15-30s. Vercel's default is 10s
// (Hobby) / 15s (Pro). Bumping to the max allowed on each tier.
export const maxDuration = 60;

interface ChatBody {
  message: string;
  threadId?: string;
}

const MAX_TOOL_ROUNDS = 6;

/**
 * Strip out known phantom phrases from historical assistant messages before
 * feeding them back to the model. Without this, the model anchors on its
 * own past hallucinations as "established conversation context" and keeps
 * regurgitating them no matter how strict the system prompt gets.
 *
 * Add to this list whenever a new hallucination pattern appears.
 */
const PHANTOM_PHRASE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // The "claude_code_bridge" / "Claude Code Bridge" / "claude code bridge" family
  {
    pattern: /\bclaude[_ -]?code[_ -]?bridge\b/gi,
    replacement: "[redacted-phantom]",
  },
  // The non-existent CLAUDE_CODE_PLUGIN_ENABLED env var
  {
    pattern: /\bCLAUDE_CODE_PLUGIN_ENABLED\b/g,
    replacement: "[redacted-phantom]",
  },
  // The fictional admin "Isaiah" who needs to toggle things
  {
    pattern: /\bIsaiah needs? to\b[^.]*\./gi,
    replacement: "[redacted-phantom].",
  },
];

function sanitizeAssistantHistory(content: string): string {
  let out = content;
  for (const { pattern, replacement } of PHANTOM_PHRASE_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

async function loadHistory(threadId: string): Promise<Anthropic.MessageParam[]> {
  const rows = await db.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    take: 40,
  });
  const out: Anthropic.MessageParam[] = [];
  for (const m of rows) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant")
      out.push({ role: "assistant", content: sanitizeAssistantHistory(m.content) });
  }
  return out;
}

interface ToolNote {
  name: string;
  input: unknown;
  output: unknown;
  error?: string;
}

/**
 * Runs the tool-use loop using the streaming Messages API.
 * `onDelta` is called for every text token as it arrives.
 * `onTool` is called once per completed tool execution.
 * Returns the final text reply and tool activity record.
 */
async function runChat(opts: {
  threadId: string;
  actor: Parameters<typeof runTool>[2];
  onDelta?: (chunk: string) => void;
  onTool?: (note: ToolNote) => void;
}): Promise<{ reply: string; toolActivity: ToolNote[] }> {
  const messages = await loadHistory(opts.threadId);
  const toolActivity: ToolNote[] = [];
  let finalText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = anthropic.messages.stream({
      model: AXIS_MODEL,
      max_tokens: 4000,
      system: AXIS_SYSTEM_PROMPT,
      tools: AXIS_TOOLS,
      messages,
    });

    if (opts.onDelta) {
      stream.on("text", (chunk) => opts.onDelta?.(chunk));
    }

    const resp = await stream.finalMessage();

    if (resp.stop_reason === "tool_use") {
      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      messages.push({ role: "assistant", content: resp.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        try {
          const output = await runTool(
            use.name,
            use.input as Record<string, unknown>,
            opts.actor
          );
          const note: ToolNote = { name: use.name, input: use.input, output };
          toolActivity.push(note);
          opts.onTool?.(note);
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: JSON.stringify(output).slice(0, 24_000),
          });
          await db.chatMessage.create({
            data: {
              threadId: opts.threadId,
              role: "tool",
              content: `${use.name} ok`,
              toolName: use.name,
              toolInput: JSON.stringify(use.input),
              toolOutput: JSON.stringify(output).slice(0, 24_000),
            },
          });
        } catch (err) {
          const msg = (err as Error).message;
          const note: ToolNote = {
            name: use.name,
            input: use.input,
            output: null,
            error: msg,
          };
          toolActivity.push(note);
          opts.onTool?.(note);
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            is_error: true,
            content: msg,
          });
          await db.chatMessage.create({
            data: {
              threadId: opts.threadId,
              role: "tool",
              content: `${use.name} error: ${msg}`,
              toolName: use.name,
              toolInput: JSON.stringify(use.input),
              toolOutput: JSON.stringify({ error: msg }),
            },
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    finalText = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    break;
  }

  if (!finalText) {
    finalText = "(Axis hit the tool-loop limit. Try a more direct ask.)";
  }

  return { reply: finalText, toolActivity };
}

export const POST = protect(async (req: NextRequest, { actor }) => {
  const { message, threadId = "main" } = (await req.json()) as ChatBody;
  if (!message?.trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set. Add it to .env to wake Axis up." },
      { status: 500 }
    );
  }

  await db.chatMessage.create({
    data: { threadId, role: "user", content: message },
  });
  await audit({ actor, action: "api:POST /api/axis/chat", target: threadId });

  const wantsStream = req.nextUrl.searchParams.get("stream") !== "0";

  // ---------- Streaming (SSE) path ----------
  if (wantsStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };

        try {
          const { reply, toolActivity } = await runChat({
            threadId,
            actor,
            onDelta: (chunk) => send("delta", { chunk }),
            onTool: (note) => send("tool", note),
          });

          await db.chatMessage.create({
            data: { threadId, role: "assistant", content: reply },
          });

          send("done", { reply, toolActivity, threadId });
        } catch (err) {
          send("error", { message: (err as Error).message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ---------- Non-streaming JSON path ----------
  const { reply, toolActivity } = await runChat({ threadId, actor });
  await db.chatMessage.create({
    data: { threadId, role: "assistant", content: reply },
  });

  return NextResponse.json({ reply, toolActivity, threadId });
});

export const GET = protect(async (req: NextRequest) => {
  const threadId = req.nextUrl.searchParams.get("threadId") ?? "main";
  const messages = await db.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return NextResponse.json({ threadId, messages });
});

/**
 * DELETE /api/axis/chat?threadId=main
 *
 * Wipes a chat thread's history. Audit-logged. Use this when the model has
 * been poisoned by its own past hallucinations and you need a clean slate
 * without changing threadId values everywhere.
 */
export const DELETE = protect(async (req: NextRequest, { actor }) => {
  const threadId = req.nextUrl.searchParams.get("threadId") ?? "main";
  const result = await db.chatMessage.deleteMany({ where: { threadId } });
  await audit({
    actor,
    action: "api:DELETE /api/axis/chat",
    target: threadId,
    payload: { deletedCount: result.count },
  });
  return NextResponse.json({ threadId, deleted: result.count });
});
