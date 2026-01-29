use futures_util::{StreamExt, SinkExt};
use uuid::Uuid;
use tracing::{info, error};
use tauri::Emitter;

use http::Request;

use bytes::Bytes;

use rustls::{
    ClientConfig,
    pki_types::ServerName
};
use tokio_rustls::TlsConnector;

use std::{
    sync::{Arc, Mutex as StdMutex},
    time::{Instant, Duration},
};

use axum::{
    extract::{State},
    extract::ws::{WebSocket, WebSocketUpgrade, Message as AxumMessage},
    response::{IntoResponse},
};

use tokio::{
    net::{TcpStream},
    sync::{mpsc, Mutex as AsyncMutex},
};
use tokio_tungstenite::{
    client_async,
    tungstenite::{
        Message as WsMessage,
        handshake::client::{generate_key},
    },
};

// --------------------- CRATES --------------------------
use crate::net::ServerState;
use crate::net::{
    Packet,
    User,
    ClientState,
    ConnectionStatus,
    broadcast_system,
    broadcast_user_list,
    send_to
};
use crate::security;
use crate::security::NoiseSession;
use crate::logger::{
    record_sent,
    record_recv,
    connection_opened,
    ConnectionGuard,
};


// --------------------- SERVER SIDE --------------------------
pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<Arc<ServerState>>) -> impl IntoResponse {
    info!("WS Upgrade request received");
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket (socket: WebSocket, state: Arc<ServerState>) {
    let connections = &state.connections;
    let (mut sender, mut receiver) = socket.split();
    // let mut user_id = Uuid::new_v4();

    connection_opened();
    let _guard = ConnectionGuard;
    
    info!("New WebSocket connection established");

    let mut noise = NoiseSession::build_noise_server();

    // --- HANDSHAKE LOOP (Noise_XX: ->e, <-e,ee,s,es, ->s,se) ---
    info!("Noise Server: Waiting for msg1...");
    match receiver.next().await {
        Some(Ok(AxumMessage::Binary(msg1))) => {
            if let Err(e) = noise.decrypt(&msg1) {
                error!("Noise Server: Decrypt msg1 failed: {}", e);
                return;
            }
            info!("Noise Server: Received and decrypted msg1");
        }
        Some(Ok(other)) => {
            info!("Noise Server: Received unexpected WS message type: {:?}", other);
            return;
        }
        Some(Err(e)) => { error!("Noise Server: WS error during msg1: {}", e); return; }
        None => { info!("Noise Server: Connection closed while waiting for msg1"); return; }
    }

    // 2. Write (Server -> Client)
    let resp = match noise.encrypt(&[]) {
        Ok(r) => r,
        Err(e) => { error!("Noise Server: Encrypt msg2 failed: {}", e); return; }
    };
    if let Err(e) = sender.send(AxumMessage::Binary(Bytes::from(resp))).await {
        error!("Noise Server: Failed to send msg2: {}", e);
        return;
    }
    info!("Noise Server: Sent msg2");

    // 3. Read (Client -> Server)
    info!("Noise Server: Waiting for msg3...");
    match receiver.next().await {
        Some(Ok(AxumMessage::Binary(msg3))) => {
            if let Err(e) = noise.decrypt(&msg3) {
                error!("Noise Server: Decrypt msg3 failed: {}", e);
                return;
            }
            info!("Noise Server: Received and decrypted msg3");
        }
        _ => { error!("Noise Server: Failed to receive msg3"); return; }
    }

    if let Err(e) = noise.transition_to_transport() {
        error!("Noise Server: Transition failed: {}", e);
        return;
    }
    info!("Noise Server: Handshake complete. Waiting for Register packet...");
    let user_noise_inner = Arc::new(AsyncMutex::new(noise));
    let (tx, mut rx) = mpsc::unbounded_channel::<AxumMessage>();

    let id = Uuid::new_v4();

    let username: String;

    if let Some(Ok(AxumMessage::Binary(bytes))) = receiver.next().await {
        let mut n_lock = user_noise_inner.lock().await;
        let plaintext = match n_lock.decrypt(&bytes) {
             Ok(pt) => pt,
             Err(e) => { error!("Decrypt error: {}", e); return; }
        };
        drop(n_lock);

        if let Ok(Packet::Register { username: reg_name }) = postcard::from_bytes(&plaintext) {
            let mut conns = connections.lock().await;

            if conns.values().any(|p| p.username == reg_name) {
                let err = Packet::Error { message: "Name already taken".into() };
                let b = postcard::to_allocvec(&err).unwrap();
                let _ = sender.send(AxumMessage::Binary(b.into())).await;
                return;
            }
            username = reg_name;
            conns.insert(id, User {
                username: username.clone(),
                tx: tx.clone(),
                _noise: Arc::clone(&user_noise_inner),
            });
        } else {
            return;
        }
    } else {
        return;
    }

    broadcast_system(&connections, format!("{} joined", username)).await;
    broadcast_user_list(&connections).await;

    let user_noise_for_send = Arc::clone(&user_noise_inner);

    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let final_msg = match msg {
                AxumMessage::Binary(raw_payload) => {
                    let mut noise = user_noise_for_send.lock().await;
                    match noise.encrypt(&raw_payload) {
                        Ok(ciphertext) => {
                            record_sent(ciphertext.len());
                            AxumMessage::Binary(ciphertext.into())
                        },
                        Err(e) => {
                            error!("Server encryption error: {}", e);
                            continue;
                        }
                    }
                },
                other => other,
            };
            if let Err(e) = sender.send(final_msg).await {
                error!("Failed to send to {}: {}", id, e);
                break;
            }
        }
    });

    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(AxumMessage::Binary(ciphertext)) => {
                record_recv(ciphertext.len());
                let mut n = user_noise_inner.lock().await;

                // Расшифровываем
                let plaintext = match n.decrypt(&ciphertext) {
                    Ok(pt) => pt,
                    Err(e) => {
                        error!("Decryption error: {}", e);
                        break; // Разрываем соединение при ошибке расшифровки
                    }
                };
                // drop(n);
                
                if let Ok(packet) = postcard::from_bytes::<Packet>(&plaintext) {
                match packet {
                    Packet::Route { to, body } => {
                        let msg_packet = Packet::Message {
                            from_id: id,
                            from_username: username.clone(),
                            body: body,
                            room_id: None,
                        };
                        let delivered = send_to(&connections, to, &msg_packet).await;
                        if !delivered {
                            let err = Packet::Error { message: "User not found or disconnected".into() };
                            let _ = send_to(&connections, id, &err).await;
                        }
                    }

                    Packet::RoomCreate { name } => {
                        info!("DEBUG: Starting RoomCreate for {}", name);
                        let room_id = state.room_manager.create_room(name).await;

                        match state.room_manager.join_room(&room_id, id, &state.connections).await {
                            Ok(_) => {
                                info!("User {} auto-joined room {}", id, room_id);
                                
                                // 3. Отправляем подтверждение создания
                                let resp = Packet::RoomCreated { room_id };
                                send_to(&connections, id, &resp).await;
                                
                                // 4. (Опционально) Отправляем системное сообщение в комнату о новом участнике
                                // Это уже должно быть внутри метода join_room, если ты его так реализовал
                            },
                            Err(e) => {
                                error!("Auto-join failed after room creation: {}", e);
                                let err = Packet::Error { message: format!("Room created, but join failed: {}", e) };
                                send_to(&connections, id, &err).await;
                            }
                        }
                    }

                    Packet::RoomJoin { room_id } => {
                        match state.room_manager.join_room(&room_id, id, &state.connections).await {
                            Ok(_) => info!("User {} joined {}", id, room_id),
                            Err(e) => error!("Join error: {}", e),
                        }
                    }

                    Packet::RoomLeave { room_id } => {
                        match state.room_manager.leave_room(&room_id, id, &state.connections).await {
                            Ok(_) => info!("User {} left {}", id, room_id),
                            Err(e) => error!("Leave error: {}", e),
                        }
                    }

                    Packet::RoomMessage { room_id, body } => {
                        super::room::send_room_message(
                            &state.room_manager,
                            &room_id,
                            id,
                            body,
                            &state.connections,
                        ).await;
                    }

                    Packet::Error { message } => {
                        info!("Client {} error: {}", id, message);
                    }

                    Packet::System { .. } => {

                    }

                    Packet::Register { .. } => {

                    }
                    Packet::Ping { timestamp } => {
                        let pong = Packet::Pong { timestamp };
                        let _ = send_to(&connections, id, &pong).await;
                    }
                    _ => {}
                }
            }
        }

        Ok(AxumMessage::Close(_)) => {
            info!("Client disconnected: {}", id);
            break;
        }

        Ok(_) => {}

        Err(e) => {
            error!("WebSocket error ({}): {}", id, e);
            break;
        }
        }
    }
    connections.lock().await.remove(&id);
    broadcast_system(&connections, format!("{} left the chat", username)).await;
    broadcast_user_list(&connections).await;
    send_task.abort();
}

// --------------------- CLIENT SIDE --------------------------

#[tauri::command]
pub async fn connect_to_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<ClientState>>,
    ip: String,
    nickname: String,
) -> Result<String, String> {
    // --------------- TLS PINNED CONFIG ---------------
    let provider = std::sync::Arc::new(rustls::crypto::ring::default_provider());

    let known_hosts = Arc::new(StdMutex::new(security::KnownHosts::load()));
    let last_fp_bridge = Arc::new(StdMutex::new(None));

    let (host, port) = if let Some((h, p)) = ip.split_once(':') {
        (h.to_string(), p.to_string())
    } else {
        (ip.clone(), "5173".to_string())
    };

    let addr = format!("{}:{}", host, port);
    
    let verifier = Arc::new(security::TofuVerifier {
        known_hosts: known_hosts.clone(),
        last_seen_fingerprint: last_fp_bridge.clone(),
        tofu_key: host.clone(),
    });

    let tls_config = ClientConfig::builder_with_provider(provider) // Замени builder() на это
    .with_safe_default_protocol_versions()
    .expect("Failed to set protocols")
    .dangerous()
    .with_custom_certificate_verifier(verifier)
    .with_no_client_auth();

    let connector = TlsConnector::from(Arc::new(tls_config));

    let tcp_stream = TcpStream::connect(&addr)
        .await
        .map_err(|e| format!("TCP Error: {}", e))?;


    let _ip = ip.clone();
    let domain = if let Ok(ip_addr) = host.parse::<std::net::IpAddr>() {
        ServerName::IpAddress(ip_addr.into())
    } else {
        ServerName::DnsName(host.clone().try_into().map_err(|_| "Invalid domain")?)
    };

    info!("Connecting to server at: {}", addr);

    let tls_stream = match connector.connect(domain, tcp_stream).await {
        Ok(stream) => stream,
        Err(err) => {
            error!("TLS connect error: {:?}", err);
            let fp_opt = last_fp_bridge.lock().unwrap().clone();
            let fp = fp_opt.unwrap_or_default();

            if fp.is_empty() {
                return Err(format!("TLS_HANDSHAKE_FAILED|{:?}", err));
            }

            return Err(format!("UNTRUSTED_HOST|{}|{}",host, fp));
        }
    };

    info!("WebSocket Upgrade successful");

    let url_str = format!("wss://{}/ws", addr);

    let request = Request::builder()
        .uri(url_str)
        .header("Host", format!("{}", &addr)) // Важно: добавляем порт в Host
        .header("Sec-WebSocket-Key", generate_key()) // Обязательный ключ
        .header("Sec-WebSocket-Version", "13")
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .body(())
        .unwrap();
    
    
    let (ws_stream, _) = client_async(request, tls_stream)
        .await
        .map_err(|e| format!("WebSocket handshake failed: {}", e))?;

    let (mut ws_tx, mut ws_rx) = ws_stream.split();

    info!("Starting Noise handshake...");
    
    let mut noise = NoiseSession::build_noise_client();

    
    // 1. Write (Client -> Server)
    let msg1 = noise.encrypt(&[]).map_err(|e| format!("Noise encrypt msg1 error: {}", e))?;
    ws_tx.send(WsMessage::Binary(msg1.into())).await.map_err(|e| e.to_string())?;
    info!("Noise Client: Sent msg1");

    // 2. Read (Server -> Client)
    info!("Noise Client: Waiting for msg2...");
    match ws_rx.next().await {
        Some(Ok(WsMessage::Binary(msg2))) => {
            noise.decrypt(&msg2).map_err(|e| format!("Noise decrypt msg2 error: {}", e))?;
            info!("Noise Client: Received and decrypted msg2");
        }
        Some(other) => return Err(format!("Expected Binary msg2, got {:?}", other)),
        None => return Err("Connection closed during handshake".into()),
    }
    
    // 3. Write (Client -> Server)
    let msg3 = noise.encrypt(&[]).map_err(|e| format!("Noise encrypt msg3 error: {}", e))?;
    ws_tx.send(WsMessage::Binary(msg3.into())).await.map_err(|e| e.to_string())?;
    info!("Noise Client: Sent msg3");

    noise.transition_to_transport().map_err(|e| format!("Noise transition error: {}", e))?;
    info!("Noise Client: Handshake complete!");
    
    // --------------- REGISTER ---------------
    let reg_packet = Packet::Register { username: nickname };
    let reg_bytes = postcard::to_allocvec(&reg_packet).unwrap();
    let ciphertext = noise.encrypt(&reg_bytes).unwrap();
    record_sent(ciphertext.len());
    ws_tx.send(WsMessage::Binary(ciphertext.into())).await.map_err(|e| e.to_string())?;

    *state.noise_session.lock().await = Some(noise);

    // --------------- CHANNEL---------------
    let (tx, mut rx) = mpsc::unbounded_channel::<WsMessage>();
    *state.client_tx.lock().await = Some(tx);


    // --------------- HEARTBEAT ---------------
    let _state_arc = state.inner().clone();
    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        let mut send_interval = tokio::time::interval(Duration::from_secs(5));
        let mut check_interval = tokio::time::interval(Duration::from_secs(2));

        loop {
            tokio::select! {
                _ = send_interval.tick() => {
                    let mut hb = _state_arc.heartbeat.lock().await;
                    let seq = hb.next_seq;
                    hb.next_seq += 1;
                    hb.pending.insert(seq, Instant::now());

                    let packet = Packet::Ping { timestamp: seq };
                    drop(hb);

                    send_packet_inner(&_state_arc, packet).await.ok();
                }

                _ = check_interval.tick() => {
                    let mut hb = _state_arc.heartbeat.lock().await;
                    let now = Instant::now();
                    let mut expired = 0;

                    hb.pending.retain(|_, sent| {
                        if now.duration_since(*sent) > Duration::from_secs(10) {
                            expired += 1;
                            false
                        } else {
                            true
                        }
                    });

                    if expired > 0 {
                        hb.misses += expired;
                        tracing::warn!("Heartbeat miss {}", hb.misses);
                        app_clone.emit(
                            "connection-status",
                            ConnectionStatus {
                                connected: true,
                                heartbeat_misses: hb.misses,
                            }
                        ).ok();
                    }

                    if hb.misses >= 3 {
                        error!("Connection degraded");
                        app_clone.emit(
                            "connection-status",
                            ConnectionStatus {
                                connected: false,
                                heartbeat_misses: hb.misses,
                            }
                        ).ok();
                        break;
                    }
                }
            }
        }
    });

    // --------------- SOCKET -> UI ---------------
    let _state_clone = state.inner().clone();
    let app_handle = app.clone();

    tauri::async_runtime::spawn(async move {
        while let Some(Ok(msg)) = ws_rx.next().await {

            if let WsMessage::Binary(ciphertext_bytes) = msg {
                record_recv(ciphertext_bytes.len());
                
                let mut noise_lock = _state_clone.noise_session.lock().await;
                
                let noise = match noise_lock.as_mut() {
                    Some(n) => n,
                    None => {
                        println!("Noise session not initialized, skipping message");
                        continue;
                    }
                };
                

                match noise.decrypt(&ciphertext_bytes) {
                    Ok(plaintext) => {
                        
                        match postcard::from_bytes::<Packet>(&plaintext) {

                            Ok(Packet::Pong { timestamp: seq }) => {
                                let mut hb = _state_clone.heartbeat.lock().await;

                                if let Some(sent) = hb.pending.remove(&seq) {
                                    let rtt = sent.elapsed().as_millis();
                                    app_handle.emit("ping-update", rtt).ok();

                                    app_handle.emit(
                                        "connection-status",
                                        ConnectionStatus {
                                            connected: true,
                                            heartbeat_misses: 0,
                                        }
                                    ).ok();

                                    hb.misses = 0;
                                }
                            }
                            
                            Ok(packet) => {
                                app_handle.emit("packet-received", &packet).unwrap();

                            }
                            Err(e) => {
                                let err_msg = format!("Deserialization error: {:?}", e);
                                println!("Failed to deserialize packet: {:?}", e);
                                let _ = app_handle.emit("packet-received", Packet::System { message: err_msg });
                            }
                        }
                    }
                    Err(e) => {
                        println!("Decryption failed: {:?}", e);
                    }
                }
            }
        }
    });

    // --------------- UI -> SOCKET ---------------
    tauri::async_runtime::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let _ = ws_tx.send(msg).await;
        }
    });

    Ok("Connected and Registered".into())
}


#[tauri::command]
pub async fn send_packet(
    state: tauri::State<'_, Arc<ClientState>>,
    packet: Packet
) -> Result<(), String> {
    send_packet_inner(state.inner(), packet).await
}


pub async fn send_packet_inner(
    state: &Arc<ClientState>,
    packet: Packet,
) -> Result<(), String> {
    let tx_lock = state.client_tx.lock().await;

    let tx = tx_lock
        .as_ref()
        .ok_or("Not connected")?;

    let bytes = postcard::to_allocvec(&packet)
        .map_err(|e| e.to_string())?;

    let mut noise_lock = state.noise_session.lock().await;
    let noise = noise_lock
        .as_mut()
        .ok_or("Noise session not initialized")?;

    let ciphertext = noise
        .encrypt(&bytes)
        .map_err(|e| format!("Encryption failed: {}", e))?;

    tx.send(WsMessage::Binary(ciphertext.into()))
        .map_err(|e| e.to_string())
}