import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { BridgeMessage, BridgeRequest, BridgeResponse, ClientInfo } from "./types.js";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
};

type BridgeOptions = {
  host: string;
  port: number;
  requestTimeoutMs: number;
};

export class EdaBridge {
  private readonly wss: WebSocketServer;
  private readonly httpServer: Server;
  private readonly pending = new Map<string, PendingRequest>();
  private client?: WebSocket;
  private clientInfo?: ClientInfo;
  private listenError?: string;
  private listening = false;

  constructor(private readonly options: BridgeOptions) {
    this.httpServer = createServer();
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on("connection", (socket, request) => {
      if (this.client && this.client.readyState === WebSocket.OPEN) {
        socket.close(1013, "Only one EDA extension client is supported");
        return;
      }

      this.client = socket;
      this.clientInfo = {
        id: randomUUID(),
        connectedAt: new Date().toISOString(),
        userAgent: request.headers["user-agent"],
      };

      socket.on("message", (raw) => this.handleMessage(raw.toString()));
      socket.on("close", () => {
        if (this.client === socket) {
          this.client = undefined;
          this.clientInfo = undefined;
          this.rejectAllPending("EDA extension disconnected");
        }
      });
      socket.on("error", (error) => {
        this.rejectAllPending(`EDA extension socket error: ${error.message}`);
      });
    });

    this.wss.on("error", (error: NodeJS.ErrnoException) => {
      this.listening = false;
      this.listenError =
        error.code === "EADDRINUSE"
          ? `${this.url} is already in use. Stop the other jlc-eda-mcp process or set JLCEDA_MCP_PORT to a free port.`
          : error.message;
    });

    this.httpServer.on("listening", () => {
      this.listening = true;
      this.listenError = undefined;
    });

    this.httpServer.on("error", (error: NodeJS.ErrnoException) => {
      this.listening = false;
      this.listenError =
        error.code === "EADDRINUSE"
          ? `${this.url} is already in use. Stop the other jlc-eda-mcp process or set JLCEDA_MCP_PORT to a free port.`
          : error.message;
    });

    this.httpServer.listen(options.port, options.host);
  }

  get url(): string {
    return `ws://${this.options.host}:${this.options.port}`;
  }

  status() {
    return {
      listening: this.listening,
      url: this.url,
      listenError: this.listenError,
      connected: this.isConnected(),
      client: this.clientInfo,
      pendingRequests: this.pending.size,
    };
  }

  isConnected(): boolean {
    return this.client?.readyState === WebSocket.OPEN;
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    if (!this.client || this.client.readyState !== WebSocket.OPEN) {
      if (this.listenError) {
        throw new Error(this.listenError);
      }

      throw new Error(
        `JLCEDA extension is not connected. Install/open the extension and connect it to ${this.url}.`,
      );
    }

    const id = randomUUID();
    const payload: BridgeRequest = {
      id,
      type: "request",
      method,
      params,
    };

    const response = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for EDA response to "${method}"`));
      }, this.options.requestTimeoutMs);

      this.pending.set(id, { resolve, reject, timer });
    });

    this.client.send(JSON.stringify(payload));
    return response;
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.rejectAllPending("Bridge is shutting down");
      this.wss.close((wssError) => {
        if (wssError) {
          reject(wssError);
          return;
        }

        this.httpServer.close((serverError) => (serverError ? reject(serverError) : resolve()));
      });
    });
  }

  private handleMessage(raw: string): void {
    let message: BridgeMessage;
    try {
      message = JSON.parse(raw) as BridgeMessage;
    } catch {
      return;
    }

    if (message.type === "response") {
      this.handleResponse(message);
      return;
    }

    if (message.type === "event" && message.event === "hello") {
      this.clientInfo = {
        ...(this.clientInfo ?? {
          id: randomUUID(),
          connectedAt: new Date().toISOString(),
        }),
        project: message.payload,
      };
    }
  }

  private handleResponse(message: BridgeResponse): void {
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(message.id);

    if (message.ok) {
      pending.resolve(message.result);
      return;
    }

    const error = new Error(message.error.message);
    error.stack = message.error.stack ?? error.stack;
    pending.reject(error);
  }

  private rejectAllPending(message: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
      this.pending.delete(id);
    }
  }
}
