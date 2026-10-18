export type Packet =
  | { system: { message: string } }
  | { userList: { users: [string, string][] } }
  | { message: { from_id: string; from_username: string; body: string; room_id?: string | null; } }
  | { roomCreated: { room_id: string } }
  | { roomCreate: { name: string } }
  | { roomJoin: { room_id: string } }
  | { roomLeave: { room_id: string } }
  | { roomSync: { room_id: string; room_name: string; users: { id: string; username: string }[] } }
  | { route: { to: string; body: string } };