import type { ChatMessage } from "../../types/Chat";
import { ChatHeader } from "./ChatHeader";
import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";

interface Props {
  activeRoomId: string | null;
  activeRoomName: string | null;
  whisperTo: string | null;
  safetyNumber?: string;
  messages: ChatMessage[];
  msgInput: string;
  onMsgInputChange: (value: string) => void;
  onSend: () => void;
  onLeave: () => void;
}

export function ChatPanel({
  activeRoomId,
  activeRoomName,
  whisperTo,
  safetyNumber,
  messages,
  msgInput,
  onMsgInputChange,
  onSend,
  onLeave,
}: Props) {
  const hasTarget = Boolean(activeRoomId || whisperTo);

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col border border-white/10 rounded-r-lg p-4 bg-dungeon-surface/60 backdrop-blur overflow-hidden">
      <ChatHeader
        roomId={activeRoomId}
        roomName={activeRoomName}
        whisperTo={whisperTo}
        safetyNumber={safetyNumber}
        onLeave={onLeave}
      />

      {!hasTarget ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-base text-gray-500 uppercase tracking-widest animate-pulse">
            Waiting for selection...
          </p>
        </div>
      ) : (
        <>
          <MessageList messages={messages} />
          <MessageInput
            value={msgInput}
            onChange={onMsgInputChange}
            onSend={onSend}
            placeholder={activeRoomId ? "Message room..." : "Whisper..."}
          />
        </>
      )}
    </div>
  );
}