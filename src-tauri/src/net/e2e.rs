use std::{collections::HashMap, sync::Arc};

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tracing::error;
use uuid::Uuid;

use crate::net::direct::send_packet_inner;
use crate::net::{ClientState, Packet};
use crate::security::{safety_number, NoiseSession};

#[derive(Serialize, Deserialize)]
struct E2ePayload {
    room_id: Option<String>,
    body: String,
}

#[derive(Serialize, Clone)]
struct E2eReady {
    peer_id: String,
    safety_number: String,
}

pub struct Peer {
    session: NoiseSession,
    ready: bool,
    initiator: bool,
    pending: Vec<(Option<String>, String)>,
}

#[derive(Default)]
pub struct E2eState {
    peers: HashMap<Uuid, Peer>,
    names: HashMap<Uuid, String>,
    rooms: HashMap<String, Vec<Uuid>>,
    my_id: Option<Uuid>,
}

fn seal(peer: &mut Peer, to: Uuid, room_id: Option<String>, body: String) -> Result<Packet, String> {
    let payload = postcard::to_allocvec(&E2ePayload { room_id, body }).map_err(|e| e.to_string())?;
    let data = peer.session.encrypt(&payload)?;
    Ok(Packet::E2eData { to, from: Uuid::nil(), data })
}


pub async fn send_dm(state: &Arc<ClientState>, to: Uuid, body: String) -> Result<(), String> {
    send_to_peer(state, to, None, body).await
}

pub async fn send_room(
    state: &Arc<ClientState>,
    app: &tauri::AppHandle,
    room_id: String,
    body: String,
) -> Result<(), String> {
    let (members, me, my_name) = {
        let e2e = state.e2e.lock().await;
        let me = e2e.my_id.ok_or("Not registered yet")?;
        let members: Vec<Uuid> = e2e
            .rooms
            .get(&room_id)
            .ok_or("Room not synced yet")?
            .iter()
            .copied()
            .filter(|u| *u != me)
            .collect();
        (members, me, e2e.names.get(&me).cloned().unwrap_or_default())
    };

    for m in members {
        if let Err(e) = send_to_peer(state, m, Some(room_id.clone()), body.clone()).await {
            error!("Room send to {m} failed: {e}");
        }
    }

    app.emit(
        "packet-received",
        &Packet::Message { from_id: me, from_username: my_name, body, room_id: Some(room_id) },
    )
        .ok();
    Ok(())
}

async fn send_to_peer(
    state: &Arc<ClientState>,
    to: Uuid,
    room_id: Option<String>,
    body: String,
) -> Result<(), String> {
    let mut e2e = state.e2e.lock().await;
    let packet = match e2e.peers.get_mut(&to) {
        Some(peer) if peer.ready => seal(peer, to, room_id, body)?,
        Some(peer) => {
            peer.pending.push((room_id, body));
            return Ok(());
        }
        None => {
            let mut session = NoiseSession::build_noise_client();
            let msg1 = session.encrypt(&[])?;
            e2e.peers.insert(
                to,
                Peer { session, ready: false, initiator: true, pending: vec![(room_id, body)] },
            );
            Packet::E2eHandshake { to, from: Uuid::nil(), step: 1, data: msg1 }
        }
    };
    send_packet_inner(state, packet).await
}


pub async fn on_packet(state: &Arc<ClientState>, app: &tauri::AppHandle, packet: &Packet) -> bool {
    match packet {
        Packet::Welcome { id } => {
            state.e2e.lock().await.my_id = Some(*id);
            true
        }
        Packet::UserList { users } => {
            let names: HashMap<Uuid, String> = users
                .iter()
                .filter_map(|(id, n)| Uuid::parse_str(id).ok().map(|u| (u, n.clone())))
                .collect();
            let mut e2e = state.e2e.lock().await;
            e2e.peers.retain(|id, _| names.contains_key(id));
            e2e.names = names;
            false
        }
        Packet::RoomSync { room_id, users, .. } => {
            state
                .e2e
                .lock()
                .await
                .rooms
                .insert(room_id.clone(), users.iter().map(|u| u.id).collect());
            false
        }
        Packet::E2eHandshake { from, step, data, .. } => {
            if let Err(e) = handle_handshake(state, app, *from, *step, data).await {
                error!("E2E handshake with {from} failed: {e}");
                state.e2e.lock().await.peers.remove(from);
            }
            true
        }
        Packet::E2eData { from, data, .. } => {
            if let Err(e) = handle_data(state, app, *from, data).await {
                error!("E2E data from {from} failed: {e}");
            }
            true
        }
        _ => false,
    }
}

async fn handle_handshake(
    state: &Arc<ClientState>,
    app: &tauri::AppHandle,
    from: Uuid,
    step: u8,
    data: &[u8],
) -> Result<(), String> {
    let mut e2e = state.e2e.lock().await;
    let my_id = e2e.my_id;

    match step {
        1 => {
            if let Some(p) = e2e.peers.get(&from) {
                if p.initiator && !p.ready && my_id.map_or(false, |me| me < from) {
                    return Ok(());
                }
            }
            let pending = e2e.peers.remove(&from).map(|p| p.pending).unwrap_or_default();
            let mut session = NoiseSession::build_noise_server();
            session.decrypt(data)?;
            let msg2 = session.encrypt(&[])?;
            e2e.peers.insert(from, Peer { session, ready: false, initiator: false, pending });
            send_packet_inner(
                state,
                Packet::E2eHandshake { to: from, from: Uuid::nil(), step: 2, data: msg2 },
            )
                .await
        }
        2 => {
            let peer = e2e
                .peers
                .get_mut(&from)
                .filter(|p| p.initiator && !p.ready)
                .ok_or("unexpected msg2")?;
            peer.session.decrypt(data)?;
            let msg3 = peer.session.encrypt(&[])?;
            peer.session.transition_to_transport()?;
            send_packet_inner(
                state,
                Packet::E2eHandshake { to: from, from: Uuid::nil(), step: 3, data: msg3 },
            )
                .await?;
            finish(state, app, from, peer).await
        }
        3 => {
            let peer = e2e
                .peers
                .get_mut(&from)
                .filter(|p| !p.initiator && !p.ready)
                .ok_or("unexpected msg3")?;
            peer.session.decrypt(data)?;
            peer.session.transition_to_transport()?;
            finish(state, app, from, peer).await
        }
        _ => Err("unknown handshake step".into()),
    }
}

async fn finish(
    state: &Arc<ClientState>,
    app: &tauri::AppHandle,
    peer_id: Uuid,
    peer: &mut Peer,
) -> Result<(), String> {
    peer.ready = true;
    let remote = peer.session.remote_static().ok_or("missing remote key")?;
    let safety = safety_number(&peer.session.local_public, &remote);
    app.emit("e2e-ready", E2eReady { peer_id: peer_id.to_string(), safety_number: safety }).ok();

    for (room_id, body) in std::mem::take(&mut peer.pending) {
        let pkt = seal(peer, peer_id, room_id, body)?;
        send_packet_inner(state, pkt).await?;
    }
    Ok(())
}

async fn handle_data(
    state: &Arc<ClientState>,
    app: &tauri::AppHandle,
    from: Uuid,
    data: &[u8],
) -> Result<(), String> {
    let (plaintext, name) = {
        let mut e2e = state.e2e.lock().await;
        let name = e2e.names.get(&from).cloned().unwrap_or_else(|| "Unknown".into());
        let peer = e2e.peers.get_mut(&from).filter(|p| p.ready).ok_or("no session")?;
        (peer.session.decrypt(data)?, name)
    };
    let payload: E2ePayload = postcard::from_bytes(&plaintext).map_err(|e| e.to_string())?;
    app.emit(
        "packet-received",
        &Packet::Message {
            from_id: from,
            from_username: name,
            body: payload.body,
            room_id: payload.room_id,
        },
    )
        .ok();
    Ok(())
}