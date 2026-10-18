import { formatBps } from "../../utils/format";

interface Props {
  enabled: boolean;
  activeConnections: number;
  speed: { upload: number; download: number };
}

export function MetricsPanel({ enabled, activeConnections, speed }: Props) {
  return (
    <div className="flex-1 bg-gray-800/40 border border-white/5 rounded-none p-4 font-mono text-xs text-gray-500 overflow-hidden relative backdrop-blur-sm">
      <div className="absolute inset-0 bg-gray-800/40 opacity-10 pointer-events-none mix-blend-overlay" />

      <div className="space-y-1 opacity-60">
        {enabled && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <div className="metrics-panel">
              <div className="text-potion-glow mb-2">
                Active Connections: <span className="text-white">{activeConnections}</span>
              </div>
              <div>Upload: {formatBps(speed.upload)}</div>
              <div>Download: {formatBps(speed.download)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}