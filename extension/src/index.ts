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
const LAYER = {
  TOP: 1,
  BOTTOM: 2,
  TOP_SILK: 3,
  BOTTOM_SILK: 4,
  BOARD_OUTLINE: 11,
  MULTI: 12,
} as const;

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

function toCoord(value: number) {
  return `${value}mm`;
}

function createPcb(name: string) {
  if (!eda.pcb?.create) {
    throw new Error("eda.pcb.create is not available in this editor context");
  }

  return eda.pcb.create(name);
}

function createPcbLine(command: any) {
  return eda.pcb_PrimitiveLine.create({
    layerId: command.layer ?? LAYER.TOP,
    net: command.net ?? "",
    points: `${toCoord(command.startX)} ${toCoord(command.startY)} ${toCoord(command.endX)} ${toCoord(command.endY)}`,
    width: toCoord(command.width ?? 0.25),
  });
}

function createPcbVia(command: any) {
  return eda.pcb_PrimitiveVia.create({
    net: command.net ?? "",
    center: `${toCoord(command.x)} ${toCoord(command.y)}`,
    holeRadius: toCoord((command.holeDiameter ?? 0.3) / 2),
    radius: toCoord((command.diameter ?? 0.6) / 2),
  });
}

function createPcbPad(command: any) {
  const isThroughHole = typeof command.holeDiameter === "number";
  return eda.pcb_PrimitivePad.create({
    number: command.padNumber,
    layerId: command.layer ?? (isThroughHole ? LAYER.MULTI : LAYER.TOP),
    net: command.net ?? "",
    center: `${toCoord(command.x)} ${toCoord(command.y)}`,
    width: toCoord(command.width ?? 1.6),
    height: toCoord(command.height ?? 1.6),
    shape: command.shape ?? "ELLIPSE",
    holeRadius: isThroughHole ? toCoord(command.holeDiameter / 2) : undefined,
  });
}

function createSchWire(command: any) {
  return eda.sch_PrimitiveWire.create({
    points: command.points.map((point: number) => toCoord(point)).join(" "),
    net: command.net,
  });
}

function createSchNetFlag(command: any) {
  return eda.sch_PrimitiveNetFlag.create({
    identification: command.identification ?? "Power",
    net: command.net,
    position: `${toCoord(command.x)} ${toCoord(command.y)}`,
    rotation: command.rotation ?? 0,
  });
}

function createSchComponent(command: any) {
  return eda.sch_PrimitiveComponent.create({
    libraryUuid: command.libraryUuid,
    uuid: command.uuid,
    subPartName: command.subPartName,
    position: `${toCoord(command.x)} ${toCoord(command.y)}`,
    rotation: command.rotation ?? 0,
    addIntoBom: command.addIntoBom ?? true,
    addIntoPcb: command.addIntoPcb ?? true,
  });
}

function createPcbComponent(command: any) {
  return eda.pcb_PrimitiveComponent.create({
    libraryUuid: command.libraryUuid,
    uuid: command.uuid,
    layerId: command.layer ?? LAYER.TOP,
    position: `${toCoord(command.x)} ${toCoord(command.y)}`,
    rotation: command.rotation ?? 0,
  });
}

function createBoardOutline(width: number, height: number) {
  const x0 = 0;
  const y0 = 0;
  const x1 = width;
  const y1 = height;

  return [
    createPcbLine({ layer: LAYER.BOARD_OUTLINE, startX: x0, startY: y0, endX: x1, endY: y0, width: 0.15 }),
    createPcbLine({ layer: LAYER.BOARD_OUTLINE, startX: x1, startY: y0, endX: x1, endY: y1, width: 0.15 }),
    createPcbLine({ layer: LAYER.BOARD_OUTLINE, startX: x1, startY: y1, endX: x0, endY: y1, width: 0.15 }),
    createPcbLine({ layer: LAYER.BOARD_OUTLINE, startX: x0, startY: y1, endX: x0, endY: y0, width: 0.15 }),
  ];
}

async function applyPcbDesign(design: any) {
  const results: unknown[] = [];

  if (design.boardName) {
    results.push(createPcb(design.boardName));
  }

  for (const command of design.commands ?? []) {
    switch (command.kind) {
      case "pcbLine":
        results.push(createPcbLine(command));
        break;
      case "pcbPad":
        results.push(createPcbPad(command));
        break;
      case "pcbVia":
        results.push(createPcbVia(command));
        break;
      case "schWire":
        results.push(createSchWire(command));
        break;
      case "schNetFlag":
        results.push(createSchNetFlag(command));
        break;
      case "schComponent":
        results.push(createSchComponent(command));
        break;
      case "pcbComponent":
        results.push(createPcbComponent(command));
        break;
      default:
        throw new Error(`Unsupported design command kind: ${command.kind}`);
    }
  }

  return {
    ok: true,
    appliedCommands: design.commands?.length ?? 0,
    createdResults: results.length,
  };
}

async function createHeaderBreakout(input: any) {
  const boardName = input.boardName ?? "AI Header Breakout";
  const width = input.width ?? 30;
  const height = input.height ?? 20;
  const rows = input.rows ?? 2;
  const pinsPerRow = input.pinsPerRow ?? 8;
  const pitch = input.pitch ?? 2.54;
  const padDiameter = input.padDiameter ?? 1.6;
  const drillDiameter = input.drillDiameter ?? 0.8;
  const traceWidth = input.traceWidth ?? 0.3;
  const fanoutLength = input.fanoutLength ?? 3;

  const commands: any[] = [];

  if (input.includeOutline ?? true) {
    commands.push(
      { kind: "pcbLine", layer: LAYER.BOARD_OUTLINE, startX: 0, startY: 0, endX: width, endY: 0, width: 0.15 },
      { kind: "pcbLine", layer: LAYER.BOARD_OUTLINE, startX: width, startY: 0, endX: width, endY: height, width: 0.15 },
      { kind: "pcbLine", layer: LAYER.BOARD_OUTLINE, startX: width, startY: height, endX: 0, endY: height, width: 0.15 },
      { kind: "pcbLine", layer: LAYER.BOARD_OUTLINE, startX: 0, startY: height, endX: 0, endY: 0, width: 0.15 },
    );
  }

  const totalHeaderWidth = (pinsPerRow - 1) * pitch;
  const totalHeaderHeight = (rows - 1) * pitch;
  const originX = (width - totalHeaderWidth) / 2;
  const originY = (height - totalHeaderHeight) / 2;

  let pin = 1;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < pinsPerRow; col += 1) {
      const x = originX + col * pitch;
      const y = originY + row * pitch;
      const net = `P${pin}`;
      commands.push({
        kind: "pcbPad",
        padNumber: String(pin),
        x,
        y,
        layer: LAYER.MULTI,
        net,
        shape: pin === 1 ? "RECT" : "ELLIPSE",
        width: padDiameter,
        height: padDiameter,
        holeDiameter: drillDiameter,
      });

      if (fanoutLength > 0) {
        const direction = row < rows / 2 ? -1 : 1;
        commands.push({
          kind: "pcbLine",
          layer: LAYER.TOP,
          net,
          startX: x,
          startY: y,
          endX: x,
          endY: y + direction * fanoutLength,
          width: traceWidth,
        });
      }

      pin += 1;
    }
  }

  return applyPcbDesign({
    boardName,
    units: "mm",
    commands,
  });
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
    case "applyPcbDesign":
      return applyPcbDesign(request.params);
    case "createHeaderBreakout":
      return createHeaderBreakout(request.params);
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
