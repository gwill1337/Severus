use uuid::Uuid;
use serde::{Serialize, Deserialize};
use ax_msg::Message as AxumMessage;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use axum::extract::ws as ax_msg;
use tokio::sync::{mpsc, Mutex as AsyncMutex};

use std::{
    sync::{Arc},
    collections::{HashMap},
    time::{Instant},
};

// --------------------- CRATES --------------------------

use crate::security::NoiseSession;

// --------------------- TYPES --------------------------

pub type Tx = mpsc::UnboundedSender<AxumMessage>;
pub type ConnectionId = Uuid;
pub type Connections = Arc<AsyncMutex<HashMap<ConnectionId, User>>>;

// --------------------- METADATA --------------------------

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum Packet {
    Register {
        username: String,
    },
    UserList {
        users: Vec<(String, String)>
    },
    Message {
        from_id: Uuid,
        from_username: String,
        body: String,
        room_id: Option<String>,
    },
    Route {
        to: Uuid,
        body: String,
    },
    Error {
        message: String,
    },
    System {
        message: String,
    },
    Ping {timestamp: u64},
    Pong {timestamp: u64},

    Heartbeat {
        seq: u64,
        sent_at: u64,
    },
    HeartbeatAck {
        seq: u64,
    },
    RoomCreate {
        name: String,
    },
    RoomJoin {
        room_id: String,
    },
    RoomLeave {
        room_id: String,
    },

    RoomCreated {
        room_id: String,
    },
    RoomJoined {
        room_id: String,
        success: bool,
    },
    RoomMessage {
        room_id: String,
        body: String,
    },
    RoomSync {
        room_id: String,
        room_name: String,
        users: Vec<UserPublicInfo>,
    },
    
}

// --------------------- STRUCTS --------------------------

#[derive(Serialize, Deserialize, Clone)]
pub struct UserPublicInfo {
    pub id: Uuid,
    pub username: String,
}

pub struct HeartbeatState {
    pub next_seq: u64,
    pub pending: HashMap<u64, Instant>,
    pub misses: u32,
}

#[derive(Clone, Serialize)]
struct ConnectionStatus {
    connected: bool,
    heartbeat_misses: u32,
}

#[derive(Clone)]
pub struct User {
    username: String,
    tx: Tx,
    _noise: Arc<AsyncMutex<NoiseSession>>,
}


pub struct ServerState {
    pub connections: Connections,
    pub running: Arc<AsyncMutex<bool>>,
    pub room_manager: Arc<RoomManager>,
}

pub struct ClientState {
    pub client_tx: AsyncMutex<Option<mpsc::UnboundedSender<WsMessage>>>,
    // pub last_untrusted_fingerprint: AsyncMutex<Option<(String, String)>>,
    pub noise_session: AsyncMutex<Option<NoiseSession>>,
    pub heartbeat: AsyncMutex<HeartbeatState>,
}

pub struct Room {
    pub _id: String,
    pub name: String,
    pub users: HashMap<Uuid, Arc<User>>,
}


pub struct RoomManager {
    pub rooms: AsyncMutex<HashMap<String, Room>>,
    pub room_names: AsyncMutex<HashMap<String, Uuid>>,
}

// --------------------- FUNCTIONS --------------------------

pub async fn broadcast_system(conns: &Connections, msg: String) {
    let packet = Packet::System { message: msg };
    let bytes = postcard::to_allocvec(&packet).unwrap();
    let conns = conns.lock().await;
    for user in conns.values() {
        let _ = user.tx.send(AxumMessage::Binary(bytes.clone().into()));
    }
}

pub async fn broadcast_user_list(connections: &Connections) {
    let conns_locked = connections.lock().await;
    let users: Vec<(String, String)> = conns_locked.iter()
        .map(|(&id, user)| (id.to_string(), user.username.clone()))
        .collect();
    let user_list_packet = Packet::UserList { users };
    let bytes = postcard::to_allocvec(&user_list_packet).unwrap();

    for user in conns_locked.values() {
        let _ = user.tx.send(AxumMessage::Binary(bytes.clone().into()));
    }
}

pub async fn send_to (
    connections: &Connections,
    target: ConnectionId,
    msg: &Packet,
) -> bool {
    let bytes = match postcard::to_allocvec(msg) {
        Ok(b) => b,
        Err(_) => return false,
    };

    let conns = connections.lock().await;
    if let Some(user) = conns.get(&target) {
        user.tx.send(AxumMessage::Binary(bytes.into())).is_ok()
    } else {
        false
    }
}

// --------------------- MODS --------------------------

pub mod room;
pub mod direct;
pub mod quic;