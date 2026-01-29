use axum::extract::ws;
use uuid::Uuid;
use tokio::sync::Mutex as AsyncMutex;

use std::{
    sync::{Arc},
    collections::{HashMap},
};

// --------------------- CRATES --------------------------

use crate::net::{
    ClientState,
    Connections,
    Packet,
    Room,
    RoomManager,
    UserPublicInfo,
    broadcast_system,
    send_to,
};

use super::direct::send_packet_inner;


impl RoomManager {
    pub fn new() -> Self {
        Self {
            rooms: AsyncMutex::new(HashMap::new()),
            room_names: AsyncMutex::new(HashMap::new()),
        }
    }

    pub async fn create_room(&self, name: String) -> String {
        let room_id = Uuid::new_v4();
        let room_id_str = room_id.to_string();

        let mut rooms = self.rooms.lock().await;
        let mut names = self.room_names.lock().await;

        names.insert(name.clone(), room_id.clone());

        let room = Room {
            _id: room_id_str.clone(),
            name: name.clone(),
            users: HashMap::new(),
        };

        rooms.insert(room_id_str.clone(), room);
        
        room_id_str
    }

    pub async fn resolve_id(&self, input: &str) -> Option<String> {
        let rooms = self.rooms.lock().await;

        if rooms.contains_key(input) {
            return Some(input.to_string());
        }
        drop(rooms);

        let names = self.room_names.lock().await;
        names.get(input).map(|uuid| uuid.to_string())
    }

    pub async fn join_room(&self, room_id: &str, user_id: Uuid, conns: &Connections) -> Result<(), String> {
        let room_id = self.resolve_id(room_id).await
            .ok_or_else(|| "Room not found".to_string())?;
        
        let (username, user_arc) = {
            let conns_locked = conns.lock().await;
            let user = conns_locked.get(&user_id).ok_or("User not found")?;
            (user.username.clone(), Arc::new(user.clone()))
        };
        
        let mut rooms = self.rooms.lock().await;

        let room = rooms.get_mut(&room_id).ok_or("Room not found")?;

        room.users.insert(user_id, user_arc);
        let room_name = room.name.clone();

        let sync_users: Vec<UserPublicInfo> = room.users.iter()
            .map(|(id, u)| UserPublicInfo { 
                id: *id, 
                username: u.username.clone() 
            })
            .collect();

        let room_members: Vec<Uuid> = room.users.keys().cloned().collect();

        drop(rooms);

        let sync_packet = Packet::RoomSync {
            room_id: room_id.to_string(),
            room_name: room_name.clone(),
            users: sync_users,
        };

        for member_id in room_members {
            let _ = send_to(conns, member_id, &sync_packet).await;
        }

        broadcast_system(conns, format!("{} joined room {}", username, room_name)).await;

        Ok(())
    }

    pub async fn leave_room(&self, room_id: &str, user_id: Uuid, conns: &Connections) -> Result<(), String> {
        let mut rooms = self.rooms.lock().await;

        if let Some(room) = rooms.get_mut(room_id) {
            if let Some(_) = room.users.remove(&user_id) {

                let room_name = room.name.clone();
                let room_members: Vec<Uuid> = room.users.keys().cloned().collect();
                

                let sync_users: Vec<UserPublicInfo> = room.users.iter()
                    .map(|(id, u)| UserPublicInfo { id: *id, username: u.username.clone() })
                    .collect();
                
                drop(rooms);

                let sync_packet = Packet::RoomSync { room_id: room_id.to_string(), room_name: room_name.clone(), users: sync_users };
                for member_id in room_members {
                    let _ = send_to(conns, member_id, &sync_packet).await;
                }

                let conns_locked = conns.lock().await;
                if let Some(user) = conns_locked.get(&user_id) {
                    let all_users: Vec<(String, String)> = conns_locked.iter()
                        .map(|(&id, u)| (id.to_string(), u.username.clone()))
                        .collect();

                    let list_packet = Packet::UserList { users: all_users };
                    let bytes = postcard::to_allocvec(&list_packet).unwrap();
                    let _ = user.tx.send(ws::Message::Binary(bytes.into()));
                }
            }
            Ok(())
        } else {
            Err("Room not found".into())
        }
    }
}

// --------------------- FUNCTIONS --------------------------

pub async fn send_room_message(
    room_mgr: &RoomManager,
    room_id: &str,
    from_id: Uuid,
    body: String,
    conns: &Connections,
) {
    let from_username = {
        let conns_lock = conns.lock().await;
        conns_lock.get(&from_id)
            .map(|u| u.username.clone())
            .unwrap_or_else(|| "Unknown".to_string())
    };

    let user_ids: Vec<Uuid> = {
        let rooms = room_mgr.rooms.lock().await;
        rooms.get(room_id)
            .map(|room| room.users.keys().cloned().collect())
            .unwrap_or_default()
    };

    let packet = Packet::Message {
        from_id,
        from_username,
        body,
        room_id: Some(room_id.to_string()),
    };

    for uid in user_ids {
        let _ = send_to(conns, uid, &packet).await;
    }
}


#[tauri::command]
pub async fn create_room(
    state: tauri::State<'_, Arc<ClientState>>,
    name: String
) -> Result<(), String> {
    let packet = Packet::RoomCreate { name };
    send_packet_inner(&state, packet).await
}

#[tauri::command]
pub async fn join_room(
    state: tauri::State<'_, Arc<ClientState>>,
    room_id: String
) -> Result<(), String> {
    let packet = Packet::RoomJoin { room_id };
    send_packet_inner(&state, packet).await
}

#[tauri::command]
pub async fn leave_room(
    state: tauri::State<'_, Arc<ClientState>>,
    room_id: String
) -> Result<(), String> {
    let packet = Packet::RoomLeave { room_id };
    send_packet_inner(&state, packet).await
}

#[tauri::command]
pub async fn send_room_message_cmd(
    state: tauri::State<'_, Arc<ClientState>>,
    room_id: String,
    message: String
) -> Result<(), String> {
    let packet = Packet::RoomMessage { room_id, body: message };
    send_packet_inner(&state, packet).await
}

