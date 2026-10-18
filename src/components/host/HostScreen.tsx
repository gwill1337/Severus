import { ControlPanel } from "./ControlPanel";
import { MetricsPanel } from "./MetricsPanel";
import { TicketBadge } from "./TicketBadge";

interface Props {
  quicTicket: string | null;
  monitoring: boolean;
  speed: { upload: number; download: number };
  activeConnections: number;
  onToggleMonitoring: () => void;
  onTicketCopied: () => void;
}

export function HostScreen({
  quicTicket,
  monitoring,
  speed,
  activeConnections,
  onToggleMonitoring,
  onTicketCopied,
}: Props) {
  return (
    <div className="flex w-full h-screen gap-4">
      {/* Left column */}
      <div className="flex flex-col w-1/6 gap-4">
        <div className="flex-1 bg-gray-900/50 border border-white/5 rounded-none backdrop-blur-sm" />

        {quicTicket && <TicketBadge ticket={quicTicket} onCopy={onTicketCopied} />}

        <ControlPanel monitoring={monitoring} onToggleMonitoring={onToggleMonitoring} />
      </div>

      {/* Right column */}
      <MetricsPanel enabled={monitoring} activeConnections={activeConnections} speed={speed} />
    </div>
  );
}