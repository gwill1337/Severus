import { useClipboard } from "../../hooks/useClipboard";

interface Props {
  roomId: string | null;
  roomName: string | null;
  whisperTo: string | null;
  safetyNumber?: string;
  onLeave: () => void;
}

export function ChatHeader({ roomId, roomName, whisperTo, safetyNumber, onLeave }: Props) {
  return (
    <div className="mb-4 px-4 py-2 border-b border-white/5 flex justify-between items-center">
      <span className="text-[10px] uppercase tracking-[0.3em] text-gray-400 flex items-center gap-2">
        {roomId ? (
          <RoomTitle roomId={roomId} roomName={roomName} />
        ) : whisperTo ? (
          `Whisper: ${whisperTo}`
        ) : (
          "Select Target"
        )}
      </span>

      {whisperTo && !roomId && <SafetyInfo safetyNumber={safetyNumber} />}

      {roomId && (
        <button
          onClick={onLeave}
          className="text-[9px] text-red-900 hover:text-red-500 uppercase cursor-pointer"
        >
          Leave Room
        </button>
      )}
    </div>
  );
}


function RoomTitle({ roomId, roomName }: { roomId: string; roomName: string | null }) {
  const { copied, copy } = useClipboard();

  return (
    <>
      Location: Room <span className="text-white">{roomName || "..."}</span> [
      <div className="relative flex flex-col items-center">
        {copied && (
          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-green-500 lowercase">
            Copied!
          </span>
        )}
        <button
          onClick={() => copy(roomId)}
          className="text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer active:scale-95"
          title="Click to copy"
        >
          {roomId.slice(0, 8)}...
        </button>
      </div>
      ]
    </>
  );
}

function SafetyInfo({ safetyNumber }: { safetyNumber?: string }) {
  return (
    <div className="mb-3 px-4 font-mono text-[10px] uppercase tracking-widest">
      {safetyNumber ? (
        <>
          <span className="text-green-500">E2EE active</span>
          <div className="mt-1 normal-case tracking-normal text-gray-400">
            Safety number:{" "}
            <span className="select-all text-potion-glow">{safetyNumber}</span>
          </div>
          <div className="normal-case tracking-normal text-gray-600">
            Compare it with your contact over another channel (call, other messenger).
          </div>
        </>
      ) : (
        <span className="text-gray-500">Secure session starts with your first message</span>
      )}
    </div>
  );
}