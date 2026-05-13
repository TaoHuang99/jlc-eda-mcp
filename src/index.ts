#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { EdaBridge } from "./edaBridge.js";

const bridge = new EdaBridge({
  host: process.env.JLCEDA_MCP_HOST ?? "127.0.0.1",
  port: Number(process.env.JLCEDA_MCP_PORT ?? "8765"),
  requestTimeoutMs: Number(process.env.JLCEDA_MCP_TIMEOUT_MS ?? "30000"),
});

const server = new McpServer({
  name: "jlc-eda-mcp",
  version: "0.1.0",
});

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

server.registerTool(
  "jlceda_status",
  {
    description: "Show whether the local JLCEDA/EasyEDA extension bridge is connected.",
    inputSchema: {},
  },
  async () => textResult(bridge.status()),
);

server.registerTool(
  "jlceda_ping",
  {
    description: "Ping the JLCEDA/EasyEDA extension inside the editor.",
    inputSchema: {},
  },
  async () => textResult(await bridge.request("ping")),
);

server.registerTool(
  "jlceda_get_context",
  {
    description: "Return basic editor and active document context from JLCEDA/EasyEDA.",
    inputSchema: {},
  },
  async () => textResult(await bridge.request("getContext")),
);

server.registerTool(
  "jlceda_eval",
  {
    description:
      "Run JavaScript in the JLCEDA/EasyEDA extension context. Use only for trusted local automation.",
    inputSchema: {
      code: z
        .string()
        .min(1)
        .describe("JavaScript expression or async function body. The global `eda` API is available."),
    },
  },
  async ({ code }) => textResult(await bridge.request("eval", { code })),
);

server.registerTool(
  "jlceda_call",
  {
    description:
      "Call a named operation implemented by the installed JLCEDA/EasyEDA extension bridge.",
    inputSchema: {
      operation: z.string().min(1).describe("Operation name, for example getContext or ping."),
      args: z.unknown().optional().describe("JSON-serializable operation arguments."),
    },
  },
  async ({ operation, args }) => textResult(await bridge.request(operation, args)),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`jlc-eda-mcp running. Waiting for EDA extension at ${bridge.url}`);
}

process.on("SIGINT", async () => {
  await bridge.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await bridge.close();
  process.exit(0);
});

main().catch((error) => {
  console.error("jlc-eda-mcp failed:", error);
  process.exit(1);
});
