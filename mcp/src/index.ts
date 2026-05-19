#!/usr/bin/env node
/**
 * @atly/axis-mcp — Claude Code plugin (MCP server) for ATLY Axis.
 *
 * Usage in a Claude Code workspace:
 *   1. Set AXIS_URL and AXIS_API_TOKEN in your environment.
 *   2. Add an entry to your .mcp.json (see mcp/.mcp.example.json).
 *   3. Restart Claude Code. The "axis" server appears with ~25 tools.
 *
 * Identifies itself in Axis audit logs as actor=plugin:claude-code.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AxisClient } from "@atly/axis-client";

import { TOOLS } from "./tools.js";


const AXIS_URL = process.env.AXIS_URL;
const AXIS_API_TOKEN = process.env.AXIS_API_TOKEN;

if (!AXIS_URL || !AXIS_API_TOKEN) {
  process.stderr.write(
    "[axis-mcp] missing env. Set AXIS_URL and AXIS_API_TOKEN before launching.\n"
  );
  process.exit(1);
}

const axis = new AxisClient({
  baseUrl: AXIS_URL,
  token: AXIS_API_TOKEN,
  actor: "plugin:claude-code",
});

const server = new Server(
  { name: "atly-axis", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    const result = await tool.run(axis, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `error in ${name}: ${(err as Error).message}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write(
  `[axis-mcp] connected. ${TOOLS.length} tools available against ${AXIS_URL}.\n`
);
