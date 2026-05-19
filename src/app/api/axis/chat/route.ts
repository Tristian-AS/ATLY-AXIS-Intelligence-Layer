import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, AXIS_MODEL, AXIS_SYSTEM_PROMPT } from "@/lib/anthropic";
import { AXIS_TOOLS, runTool } from "@/lib/tools";
import { db } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  message: string;
  threadId?: string;
}

const MAX_TOOL_ROUNDS = 6;

export async function POST(req: NextRequest) {
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

  const history = await db.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    take: 40,
  });

  const messages: Anthropic.MessageParam[] = [];
  for (const m of history) {
    if (m.role === "user") {
      messages.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      messages.push({ role: "assistant", content: m.content });
    }
    // tool rows are skipped — they exist only as a record; the live tool loop
    // re-derives tool_use / tool_result blocks below.
  }

  const toolActivity: Array<{ name: string; input: unknown; output: unknown; error?: string }> = [];
  let finalText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await anthropic.messages.create({
      model: AXIS_MODEL,
      max_tokens: 4000,
      system: AXIS_SYSTEM_PROMPT,
      tools: AXIS_TOOLS,
      messages,
    });

    if (resp.stop_reason === "tool_use") {
      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      messages.push({ role: "assistant", content: resp.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        try {
          const output = await runTool(use.name, use.input as Record<string, unknown>);
          toolActivity.push({ name: use.name, input: use.input, output });
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: JSON.stringify(output).slice(0, 24_000),
          });
          await db.chatMessage.create({
            data: {
              threadId,
              role: "tool",
              content: `${use.name} ok`,
              toolName: use.name,
              toolInput: JSON.stringify(use.input),
              toolOutput: JSON.stringify(output).slice(0, 24_000),
            },
          });
        } catch (err) {
          const msg = (err as Error).message;
          toolActivity.push({ name: use.name, input: use.input, output: null, error: msg });
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            is_error: true,
            content: msg,
          });
          await db.chatMessage.create({
            data: {
              threadId,
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

  await db.chatMessage.create({
    data: { threadId, role: "assistant", content: finalText },
  });

  return NextResponse.json({
    reply: finalText,
    toolActivity,
    threadId,
  });
}

export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get("threadId") ?? "main";
  const messages = await db.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return NextResponse.json({ threadId, messages });
}
