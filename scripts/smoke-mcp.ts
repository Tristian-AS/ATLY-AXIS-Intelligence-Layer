// Smoke test for the @atly/axis-mcp Claude Code plugin.
// Spawns the MCP server, exchanges JSON-RPC messages over stdio,
// and verifies tools/list + a couple of tools/call invocations.

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const serverPath = resolve("mcp/dist/index.js");

const child = spawn("node", [serverPath], {
  env: {
    ...process.env,
    AXIS_URL: "http://localhost:3018",
    AXIS_API_TOKEN: "test-token-not-secret-just-for-smoke-test",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

let buffer = "";
const pending = new Map<number, (msg: unknown) => void>();
let nextId = 1;

child.stdout.on("data", (chunk: Buffer) => {
  buffer += chunk.toString();
  let i: number;
  while ((i = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, i).trim();
    buffer = buffer.slice(i + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line) as { id?: number };
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)!(msg);
        pending.delete(msg.id);
      }
    } catch {
      console.error("[malformed line]", line);
    }
  }
});

function rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
  const id = nextId++;
  const req = { jsonrpc: "2.0", id, method, params };
  child.stdin.write(JSON.stringify(req) + "\n");
  return new Promise((res) => pending.set(id, (msg) => res(msg as T)));
}

async function main() {
  // Initialize handshake
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0.0.0" },
  });
  console.log("[initialize]", JSON.stringify((init as { result: unknown }).result).slice(0, 200));

  child.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"
  );

  const listed = (await rpc<{ result: { tools: { name: string }[] } }>("tools/list")).result;
  console.log(`[tools/list] ${listed.tools.length} tools`);
  console.log(
    "[tools/list] first 5:",
    listed.tools.slice(0, 5).map((t) => t.name).join(", ")
  );

  const status = (await rpc<{ result: { content: { text: string }[] } }>("tools/call", {
    name: "axis_status",
    arguments: {},
  })).result;
  const statusJson = JSON.parse(status.content[0].text);
  console.log(
    `[axis_status] activeClients=${statusJson.status.counts.activeClients}`,
    `activeProjects=${statusJson.status.counts.activeProjects}`,
    `taxes=${statusJson.taxes.periodLabel}`
  );

  const created = (await rpc<{ result: { content: { text: string }[] } }>("tools/call", {
    name: "axis_clients_create",
    arguments: {
      name: "PlumridgeCo",
      industry: "industrial design",
      stage: "lead",
      brandNotes: "Heritage, ironwork, restrained.",
    },
  })).result;
  const createdJson = JSON.parse(created.content[0].text);
  console.log(`[axis_clients_create] created ${createdJson.client.name} (${createdJson.client.id})`);

  const list = (await rpc<{ result: { content: { text: string }[] } }>("tools/call", {
    name: "axis_clients_list",
    arguments: {},
  })).result;
  const listJson = JSON.parse(list.content[0].text);
  console.log(
    `[axis_clients_list] ${listJson.clients.length} clients:`,
    listJson.clients.map((c: { name: string }) => c.name).join(", ")
  );

  console.log("\nMCP plugin smoke tests passed.");
  child.kill();
}

main().catch((e) => {
  console.error("[FAIL]", e);
  child.kill();
  process.exit(1);
});
