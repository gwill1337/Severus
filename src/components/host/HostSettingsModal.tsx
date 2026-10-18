import type { ConnectionType } from "../../types/Connection";

interface Props {
  connectionType: ConnectionType;
  port: string;
  onConnectionTypeChange: (type: ConnectionType) => void;
  onPortChange: (port: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function HostSettingsModal({
  connectionType,
  port,
  onConnectionTypeChange,
  onPortChange,
  onCancel,
  onConfirm,
}: Props) {
  const tabClass = (active: boolean) =>
    `flex-1 py-2 text-[10px] uppercase tracking-widest transition-all rounded-md ${
      active
        ? "bg-slytherin/60 text-potion-glow shadow-[0_0_10px_rgba(74,222,128,0.2)]"
        : "text-gray-500 hover:text-gray-300"
    }`;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dungeon-surface border border-slytherin p-8 rounded-xl w-full max-w-sm text-center">
        <h2 className="font-serif text-xl text-potion-glow mb-6 uppercase tracking-widest">
          Host Settings
        </h2>

        {/* Switcher Direct / Quic */}
        <div className="flex bg-black/40 p-1 rounded-lg mb-6 border border-white/5">
          <button
            onClick={() => onConnectionTypeChange("direct")}
            className={tabClass(connectionType === "direct")}
          >
            Direct
          </button>
          <button
            onClick={() => onConnectionTypeChange("quic")}
            className={tabClass(connectionType === "quic")}
          >
            Quic (Magic)
          </button>
        </div>

        {/* Port */}
        <input
          autoFocus
          value={port}
          onChange={(e) => onPortChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onConfirm()}
          placeholder="Port (e.g. 5173)"
          className="w-full bg-black/40 border border-white/10 rounded-lg p-3 mb-6 outline-none text-xs text-center font-mono"
        />

        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 border text-xs text-red-400 hover:text-red-500 transition-colors duration-150 rounded py-2"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 border text-green-400 rounded py-2 text-xs hover:text-green-500 transition-colors duration-150"
          >
            Start Host
          </button>
        </div>
      </div>
    </div>
  );
}