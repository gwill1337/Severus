import { useState } from "react";
import type { ConnectionStatus } from "../types/Connection";
import { useTauriEvent } from "./useTauriEvent";
import * as api from "../api/tauri";

export function useMonitoring() {
  const [ping, setPing] = useState(0);
  const [monitoring, setMonitoringState] = useState(false);
  const [speed, setSpeed] = useState({ upload: 0, download: 0 });
  const [activeConnections, setActiveConnections] = useState(0);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>({
    connected: false,
    heartbeat_misses: 0,
  });

  useTauriEvent<number>("ping-update", setPing);
  useTauriEvent<ConnectionStatus>("connection-status", setConnStatus);
  useTauriEvent<{ upload: number; download: number; active_connections: number }>(
    "network-speed",
    (p) => {
      setSpeed({ upload: p.upload, download: p.download });
      setActiveConnections(p.active_connections);
    }
  );

  const toggleMonitoring = async () => {
    const next = !monitoring;
    setMonitoringState(next);
    try {
      await api.setMonitoring(next);
    } catch (err) {
      console.error(err);
      setMonitoringState(!next);
    }
  };

  const connectionState: "offline" | "bad" | "ok" =
    !connStatus.connected ? "offline" : connStatus.heartbeat_misses > 3 ? "bad" : "ok";

  return { ping, monitoring, speed, activeConnections, connectionState, toggleMonitoring };
}