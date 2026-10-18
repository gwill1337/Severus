import { useState } from "react";
import type { Dialogs, User } from "../types/Chat";
import type { Packet } from "../types/Packet";
import { useTauriEvent } from "./useTauriEvent";
import * as api from "../api/tauri";
import { MAX_MESSAGE_LENGTH } from "../utils/limits";

interface UseChatParams {
  activeRoomId: string | null;
  activeUserId: string | null;
}

export function useChat({ activeRoomId, activeUserId }: UseChatParams) {
  const [dialogs, setDialogs] = useState<Dialogs>({});
  const [globalUsers, setGlobalUsers] = useState<User[]>([]);
  const [safetyNumbers, setSafetyNumbers] = useState<Record<string, string>>({});
  const [msgInput, setMsgInput] = useState("");

  useTauriEvent<Packet>("packet-received", (packet) => {
    if ("userList" in packet) {
      setGlobalUsers(packet.userList.users.map(([id, username]) => ({ id, username })));
    }
    if ("message" in packet) {
      const m = packet.message;
      const key = m.room_id ? `room_${m.room_id}` : m.from_id;
      setDialogs((prev) => ({
        ...prev,
        [key]: [...(prev[key] || []), { from_username: m.from_username, body: m.body }],
      }));
    }
  });

  useTauriEvent<{ peer_id: string; safety_number: string }>("e2e-ready", (p) =>
    setSafetyNumbers((prev) => ({ ...prev, [p.peer_id]: p.safety_number }))
  );

  const sendMessage = async () => {
    if (!msgInput.trim() || msgInput.length > MAX_MESSAGE_LENGTH) return;
    try {
      if (activeRoomId) {
        await api.sendRoomMessage(activeRoomId, msgInput);
      } else if (activeUserId) {
        await api.sendDirect(activeUserId, msgInput);
        setDialogs((prev) => ({
          ...prev,
          [activeUserId]: [...(prev[activeUserId] || []), { from_username: "Me", body: msgInput }],
        }));
      }
      setMsgInput("");
    } catch (e) {
      console.error(e);
    }
  };

  return {
    dialogs,
    globalUsers,
    safetyNumbers,
    msgInput,
    setMsgInput,
    sendMessage,
  };
}