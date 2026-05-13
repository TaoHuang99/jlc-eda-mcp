#!/usr/bin/env node
import WebSocket from "ws";

const url = process.env.JLCEDA_MCP_URL ?? "ws://127.0.0.1:8765";
const socket = new WebSocket(url);

socket.on("open", () => {
  console.error(`[mock-extension] connected to ${url}`);
  socket.send(
    JSON.stringify({
      type: "event",
      event: "hello",
      payload: {
        mock: true,
        editor: "mock-jlceda",
      },
    }),
  );
});

socket.on("message", async (raw) => {
  const request = JSON.parse(raw.toString());
  if (request.type !== "request") {
    return;
  }

  try {
    let result;
    switch (request.method) {
      case "ping":
        result = { pong: true, mock: true };
        break;
      case "getContext":
        result = {
          mock: true,
          connected: true,
          bridgeUrl: url,
        };
        break;
      case "eval":
        result = {
          mock: true,
          receivedCode: request.params?.code,
        };
        break;
      default:
        throw new Error(`Unknown mock operation: ${request.method}`);
    }

    socket.send(
      JSON.stringify({
        id: request.id,
        type: "response",
        ok: true,
        result,
      }),
    );
  } catch (error) {
    socket.send(
      JSON.stringify({
        id: request.id,
        type: "response",
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      }),
    );
  }
});

socket.on("close", () => {
  console.error("[mock-extension] disconnected");
});

socket.on("error", (error) => {
  console.error("[mock-extension] error:", error.message);
  process.exitCode = 1;
});
