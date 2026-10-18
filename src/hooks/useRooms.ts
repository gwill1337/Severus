import { useState } from "react";
import { useTauriEvent } from "./useTauriEvent";
import type { Packet } from "../types/Packet";
import type { User } from "../types/Chat";
import * as api from "../api/tauri";

export function useRooms({ onRoomSelected }: { onRoomSelected: () => void }) {
    const [roomName, setRoomName] = useState("");
    const [roomIdToJoin, setRoomIdToJoin] = useState("");
    const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
    const [activeRoomName, setActiveRoomName] = useState<string | null>(null);
    const [roomUsers, setRoomUsers] = useState<User[]>([]);

    useTauriEvent<Packet>("packet-received", (packet) => {
        if ("roomCreated" in packet) {
            setActiveRoomId(packet.roomCreated.room_id);
        }
        if ("roomSync" in packet) {
            const { room_id, room_name, users } = packet.roomSync;
            if (activeRoomId === room_id || roomIdToJoin === room_name || roomIdToJoin === room_id) {
                setActiveRoomId(room_id);
                setActiveRoomName(room_name);
                setRoomUsers(users);
                setRoomIdToJoin("");
            }
        }
        if ("roomLeave" in packet) {
            setActiveRoomId(null);
            setActiveRoomName(null);
        }
    });

    const createRoom = async () => {
        if (!roomName.trim()) return;
        try {
          setRoomIdToJoin(roomName);
          await api.createRoom(roomName);
          setRoomName("");
          onRoomSelected();
        } catch (e) {
          console.error("Send error:", e);
        }
      };

    const joinRoom = async () => {
        try {
          await api.joinRoom(roomIdToJoin);
          onRoomSelected();
          setRoomIdToJoin("");
        } catch (e) {
          console.error("Send error:", e);
        }
      };

    const leaveRoom = async () => {
    if (!activeRoomId) return;
    try {
      await api.leaveRoom(activeRoomId)
      setActiveRoomId(null);
      setActiveRoomName(null);
    } catch (e) {
      console.error("Send error:", e);
    }
  };

  return {
    roomName, setRoomName, roomIdToJoin, setRoomIdToJoin,
    activeRoomId, setActiveRoomId, activeRoomName, roomUsers,
    createRoom, joinRoom, leaveRoom,
  };
}