export type BridgeRequest = {
  id: string;
  type: "request";
  method: string;
  params?: unknown;
};

export type BridgeResponse =
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

export type BridgeEvent = {
  type: "event";
  event: string;
  payload?: unknown;
};

export type BridgeMessage = BridgeRequest | BridgeResponse | BridgeEvent;

export type ClientInfo = {
  id: string;
  connectedAt: string;
  userAgent?: string;
  project?: unknown;
};
