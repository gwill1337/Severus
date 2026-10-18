import type { ConnectionType } from "../../types/Connection";
import { SegmentedSwitch } from "../ui/SegmentedSwitch";

interface Props {
  connectionType: ConnectionType;
  ip: string;
  nickname: string;
  onConnectionTypeChange: (type: ConnectionType) => void;
  onIpChange: (ip: string) => void;
  onNicknameChange: (nickname: string) => void;
  onCancel: () => void;
  onConnect: () => void;
}

export function ConnectModal({
  connectionType,
  ip,
  nickname,
  onConnectionTypeChange,
  onIpChange,
  onNicknameChange,
  onCancel,
  onConnect,
}: Props) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dungeon-surface border border-slytherin p-8 rounded-xl w-full max-w-sm text-center">
        <h2 className="font-serif text-xl text-potion-glow mb-6 uppercase tracking-widest">
          Identify Yourself
        </h2>

        <SegmentedSwitch
          value={connectionType}
          onChange={onConnectionTypeChange}
          options={[
            { value: "direct", label: "Direct" },
            { value: "quic", label: "Quic" },
          ]}
        />

        {/* IP / ticket */}
        <input
          value={ip}
          onChange={(e) => onIpChange(e.target.value)}
          placeholder={
            connectionType === "direct" ? "Server IP (e.g. 192.168.1.5)" : "Enter Quic Ticket..."
          }
          className="w-full bg-black/40 border border-white/10 rounded-lg p-3 mb-4 outline-none text-xs text-center font-mono placeholder:font-sans focus:border-potion-glow/50 transition-colors"
        />

        {/* Nickname */}
        <input
          autoFocus
          value={nickname}
          onChange={(e) => onNicknameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onConnect()}
          placeholder="Enter nickname..."
          className="w-full bg-black/40 border border-white/10 rounded-lg p-3 mb-6 outline-none text-xs text-center focus:border-potion-glow/50 transition-colors"
        />

        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 border border-white/10 text-xs text-red-400 hover:text-red-500 hover:border-red-500/30 ease-in-out duration-150 transition-all rounded py-2"
          >
            Cancel
          </button>
          <button
            onClick={onConnect}
            className="flex-1 border border-slytherin/50 text-green-400 rounded py-2 text-xs hover:bg-slytherin/10 hover:text-green-300 hover:border-slytherin ease-in-out duration-150 transition-all shadow-[0_0_15px_rgba(74,222,128,0.1)] hover:shadow-[0_0_20px_rgba(74,222,128,0.25)]"
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}