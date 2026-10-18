import { invoke } from "@tauri-apps/api/core";
import type { Packet } from "../types/Packet";
// import type { HostConnectionType } from "../types/Connection";

export const sendPacket = (packet: Packet) => invoke("send_packet", { packet });
export const createRoom = (name: string) => sendPacket({ roomCreate: { name } });
export const joinRoom = (roomId: string) => sendPacket({ roomJoin: { room_id: roomId } });
export const leaveRoom = (roomId: string) => sendPacket({ roomLeave: { room_id: roomId } });
export const sendRoomMessage = (roomId: string, message: string) => invoke("send_room_message_cmd", { roomId, message });
export const sendDirect = (to: string, body: string) =>
  sendPacket({ route: { to, body } });
export const setMonitoring = (enabled: boolean) => invoke("set_monitoring_status", { enabled });

