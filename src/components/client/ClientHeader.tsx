import type { ConnectionState } from "../../types/Connection";
import { truncate } from "../../utils/format";

interface Props {
  ip: string;
  ping: number;
  state: ConnectionState;
}

const STATE_STYLE: Record<ConnectionState, string> = {
  ok: "text-green-500",
  bad: "text-red-500 animate-pulse",
  offline: "text-gray-500",
};

export function ClientHeader({ ip, ping, state }: Props) {
  return (
    <div className="text-right mb-2">
      <span className="text-2xl font-serif tracking-[0.25em] uppercase">Severus</span>
      <span className={ping > 150 ? "text-red-500" : "text-potion-glow"}>{ping}ms</span>

      <div className={`text-[10px] uppercase tracking-widest -mt-1 ${STATE_STYLE[state]}`}>
        {state === "ok" && `Connected to ${truncate(ip, 21)}`}
        {state === "bad" && "Connection unstable"}
        {state === "offline" && "Disconnected"}
      </div>
    </div>
  );
}