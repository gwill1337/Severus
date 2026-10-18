export type ConnectionStatus = {
  connected: boolean;
  heartbeat_misses: number;
};

export type Mode = "menu" | "host" | "client";
export type ConnectionType = "direct" | "quic";
export type ConnectionState = "ok" | "bad" | "offline";
