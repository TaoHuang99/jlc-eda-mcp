/* global eda */

type BridgeRequest = {
  id: string;
  type: "request";
  method: string;
  params?: unknown;
};

type BridgeResponse =
  | {
      id: string;
      type: "response";
      ok: true;
      result: unknown;
    }
  | {
      id: string;
      type: "response";
      ok: false;
      error: {
        message: string;
        stack?: string;
      };
    };

declare const eda: any;

const SOCKET_ID = "jlc-eda-mcp";
const DEFAULT_URL = "ws://127.0.0.1:8765";

let connected = false;
let lastUrl = DEFAULT_URL;

function send(message: BridgeResponse | { type: "event"; event: string; payload?: unknown }) {
  eda.sys_WebSocket.send(SOCKET_ID, JSON.stringify(message));
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

async function getContext() {
  const environment = {
    version: safeCall(() => eda.sys_Environment.getEditorCurrentVersion()),
    user: safeCall(() => eda.sys_Environment.getUserInfo()),
    isClient: safeCall(() => eda.sys_Environment.isClient()),
    isWeb: safeCall(() => eda.sys_Environment.isWeb()),
    isJlcEdaPro: safeCall(() => eda.sys_Environment.isJLCEDAProEdition()),
    isEasyEdaPro: safeCall(() => eda.sys_Environment.isEasyEDAProEdition()),
    isOfflineMode: safeCall(() => eda.sys_Environment.isOfflineMode()),
  };

  return {
    connected,
    socketId: SOCKET_ID,
    bridgeUrl: lastUrl,
    environment,
  };
}

function safeCall(fn: () => unknown) {
  try {
    return fn();
  } catch (error) {
    return { error: serializeError(error).message };
  }
}

async function runEval(code: string) {
  const asyncRunner = new Function(
    "eda",
    `"use strict"; return (async () => {\n${code}\n})();`,
  ) as (edaApi: unknown) => Promise<unknown>;

  return asyncRunner(eda);
}

async function dispatch(request: BridgeRequest) {
  switch (request.method) {
    case "ping":
      return {
        pong: true,
        time: new Date().toISOString(),
      };
    case "getContext":
      return getContext();
    case "eval": {
      const params = request.params as { code?: unknown } | undefined;
      if (!params || typeof params.code !== "string") {
        throw new Error("eval requires params.code");
      }
      return runEval(params.code);
    }
    default:
      throw new Error(`Unknown operation: ${request.method}`);
  }
}

async function onMessage(event: MessageEvent<string>) {
  let request: BridgeRequest;
  try {
    request = JSON.parse(event.data) as BridgeRequest;
  } catch (error) {
    console.error("[JLCEDA MCP] Invalid bridge message", error);
    return;
  }

  if (request.type !== "request") {
    return;
  }

  try {
    const result = await dispatch(request);
    send({
      id: request.id,
      type: "response",
      ok: true,
      result,
    });
  } catch (error) {
    send({
      id: request.id,
      type: "response",
      ok: false,
      error: serializeError(error),
    });
  }
}

export async function connectBridge(url = DEFAULT_URL) {
  lastUrl = url;

  try {
    eda.sys_WebSocket.register(
      SOCKET_ID,
      url,
      onMessage,
      async () => {
        connected = true;
        send({
          type: "event",
          event: "hello",
          payload: await getContext(),
        });
        eda.sys_Message.showToastMessage("JLCEDA MCP bridge connected");
      },
    );
  } catch (error) {
    connected = false;
    eda.sys_Dialog.showInformationMessage(
      `Unable to connect to ${url}.\n\n${serializeError(error).message}\n\nEnable External Interactions for this extension and make sure the MCP server is running.`,
      "JLCEDA MCP Bridge",
      "OK",
    );
    throw error;
  }
}

export async function showStatus() {
  const context = await getContext();
  eda.sys_Dialog.showInformationMessage(
    JSON.stringify(context, null, 2),
    "JLCEDA MCP Bridge Status",
    "OK",
  );
}
