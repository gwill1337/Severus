import type { useChat } from "../../hooks/useChat";
import type { useMonitoring } from "../../hooks/useMonitoring";
import type { useRooms } from "../../hooks/useRooms";
import { ChatPanel } from "./ChatPanel";
import { ClientHeader } from "./ClientHeader";
import { RoomControls } from "./RoomControls";
import { UserList } from "./UserList";

interface Props {
  ip: string;
  monitoring: ReturnType<typeof useMonitoring>;
  rooms: ReturnType<typeof useRooms>;
  chat: ReturnType<typeof useChat>;
  activeUserId: string | null;
  onSelectUser: (id: string) => void;
}

export function ClientScreen({ ip, monitoring, rooms, chat, activeUserId, onSelectUser }: Props) {
  const { activeRoomId } = rooms;

  const users = activeRoomId ? rooms.roomUsers : chat.globalUsers;

  const dialogKey = activeRoomId ? `room_${activeRoomId}` : activeUserId;
  const messages = dialogKey ? chat.dialogs[dialogKey] ?? [] : [];

  const whisperTo =
    !activeRoomId && activeUserId
      ? chat.globalUsers.find((u) => u.id === activeUserId)?.username ?? "Unknown"
      : null;

  return (
    <div className="relative z-10 w-full h-screen flex flex-col gap-6 px-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mt-3">
        <RoomControls
          roomName={rooms.roomName}
          onRoomNameChange={rooms.setRoomName}
          roomIdToJoin={rooms.roomIdToJoin}
          onRoomIdChange={rooms.setRoomIdToJoin}
          onCreate={rooms.createRoom}
          onJoin={rooms.joinRoom}
        />

        <ClientHeader ip={ip} ping={monitoring.ping} state={monitoring.connectionState} />
      </div>

      <div className="flex flex-1 gap-4 flex-row overflow-hidden pb-6">
        <UserList
          title={activeRoomId ? "Room Members" : "Online Users"}
          users={users}
          activeUserId={activeUserId}
          onSelect={onSelectUser}
        />

        <ChatPanel
          activeRoomId={activeRoomId}
          activeRoomName={rooms.activeRoomName}
          whisperTo={whisperTo}
          safetyNumber={activeUserId ? chat.safetyNumbers[activeUserId] : undefined}
          messages={messages}
          msgInput={chat.msgInput}
          onMsgInputChange={chat.setMsgInput}
          onSend={chat.sendMessage}
          onLeave={rooms.leaveRoom}
        />
      </div>
    </div>
  );
}