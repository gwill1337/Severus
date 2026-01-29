use log::warn;

use tokio_util::codec::{Framed, LengthDelimitedCodec};
use futures_util::{StreamExt, SinkExt};
use bytes::Bytes;
use uuid::Uuid;
use tracing::{info, error};
use tauri::Emitter;

use iroh_tickets::endpoint::EndpointTicket;
use rustls::{ClientConfig, pki_types::ServerName};
use tokio_rustls::{TlsAcceptor, TlsConnector};

use axum::extract::ws::Message as AxumMessage;
use tokio_tungstenite::tungstenite::Message as WsMessage;

use std::{
    sync::{Arc, Mutex as StdMutex},
    pin::{Pin},
    task::{Context, Poll},
    time::{Instant, Duration},
};

use tokio::{
    io::{AsyncRead, AsyncWrite, ReadBuf},
    sync::{mpsc, Mutex as AsyncMutex},
};

// --------------------- CRATES --------------------------
use crate::net::{
    Packet,
    User,
    ConnectionStatus,
    ClientState,
    broadcast_system,
    broadcast_user_list,
};
use crate::security;
use crate::net::ServerState;
use crate::security::NoiseSession;


use super::send_to;

use crate::logger::{
    record_sent,
    record_recv,
    connection_opened,
    ConnectionGuard,
};
// --------------------- SERVER SIDE --------------------------
pub async fn handle_iroh_socket(
    send_stream: iroh::endpoint::SendStream,
    recv_stream: iroh::endpoint::RecvStream,
    state: Arc<ServerState>,
    tls_acceptor: TlsAcceptor,
) {

    let iroh_stream = IrohRW {send: send_stream, recv: recv_stream};

    let tls_stream = match tls_acceptor.accept(iroh_stream).await {
        Ok(s) => s,
        Err(e) => {
            error!("TLS handshake over Iroh failed: {}", e);
            return;
        }
    };

    connection_opened();
    let _guard = ConnectionGuard;

    let (read_half, write_half) = tokio::io::split(tls_stream);
    
    
    let mut framed_reader = Framed::new(read_half, LengthDelimitedCodec::new());
    let mut framed_writer = Framed::new(write_half, LengthDelimitedCodec::new());

    let mut noise = NoiseSession::build_noise_server();

    // --- NOISE HANDSHAKE ---
    info!("Iroh Noise: Waiting for msg1...");
    match framed_reader.next().await {
        Some(Ok(msg1)) => {
            if let Err(e) = noise.decrypt(&msg1) {
                error!("Noise msg1 error: {e}");
                return;
            }
            info!("Iroh Noise: Received msg1");
        }
        _ => return,
    }

    let resp = match noise.encrypt(&[]) {
        Ok(r) => r,
        Err(e) => { error!("Noise encrypt error: {e}"); return; }
    };
    let _ = framed_writer.send(Bytes::from(resp)).await;

    match framed_reader.next().await {
        Some(Ok(msg3)) => {
            if let Err(e) = noise.decrypt(&msg3) {
                error!("Noise msg3 error: {e}");
                return;
            }
        }
        _ => return,
    }

    noise.transition_to_transport().unwrap();
    info!("Iroh Noise: Handshake complete");

    let user_noise_inner = Arc::new(AsyncMutex::new(noise));
        
    let (tx, mut rx) = mpsc::unbounded_channel::<AxumMessage>();
    let (socket_tx, mut socket_rx) = mpsc::unbounded_channel::<Bytes>();
    
    let id = Uuid::new_v4();
    let username: String;

    let writer_task = tokio::spawn(async move {
        while let Some(raw_bytes) = socket_rx.recv().await {
            record_sent(raw_bytes.len());
            if let Err(_) = framed_writer.send(raw_bytes).await { break; }
        }
    });
    
    if let Some(Ok(bytes)) = framed_reader.next().await {
        let mut n_lock = user_noise_inner.lock().await;
        let plaintext = n_lock.decrypt(&bytes).unwrap(); // В продакшене обработай ошибку
        drop(n_lock);

        if let Ok(Packet::Register { username: reg_name }) = postcard::from_bytes(&plaintext) {
            let mut conns = state.connections.lock().await;
            if conns.values().any(|p| p.username == reg_name) {
                // Если имя занято — шлем ошибку и выходим
                let err = Packet::Error { message: "Name already taken".into() };
                let b = postcard::to_allocvec(&err).unwrap();
                let mut n = user_noise_inner.lock().await;
                if let Ok(c) = n.encrypt(&b) { let _ = socket_tx.send(Bytes::from(c)); }
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


    let welcome_msg = format!("Welcome, {}. Your connection id: {}", username, id);
    
    let _ = tx.send(AxumMessage::Text(welcome_msg.into()));

    broadcast_system(&state.connections, format!("{} joined via Iroh", username)).await;
    broadcast_user_list(&state.connections).await;


    let user_noise_for_send = Arc::clone(&user_noise_inner);
    let socket_tx_for_bridge = socket_tx.clone();
    let bridge_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {

            let bytes_to_send = match msg {
                AxumMessage::Binary(b) => b.to_vec(),
                AxumMessage::Text(t) => t.as_bytes().to_vec(),
                _ => continue,
            };
            
            let mut noise = user_noise_for_send.lock().await;
            if let Ok(ciphertext) = noise.encrypt(&bytes_to_send) {
                let _ = socket_tx_for_bridge.send(Bytes::from(ciphertext));
            }
        }
    });

    let socket_tx_for_loop = socket_tx.clone();
    
    // (Iroh -> Server Logic)
    while let Some(result) = framed_reader.next().await {
        match result {
            Ok(bytes) => {
                record_recv(bytes.len());

                let mut n_lock = user_noise_inner.lock().await;
                let plaintext = match n_lock.decrypt(&bytes) {
                    Ok(p) => p,
                    Err(e) => {
                        error!("Failed to decrypt Noise packet: {}", e);
                        continue;
                    }
                };
                drop(n_lock);

                if let Ok(packet) = postcard::from_bytes::<Packet>(&plaintext) {
                    match packet {
                        Packet::Route { to, body } => {
                            let msg_packet = Packet::Message {
                                from_id: id,
                                from_username: username.clone(),
                                body,
                                room_id: None,
                            };
                            let delivered = send_to(&state.connections, to, &msg_packet).await;
                            if !delivered {
                                let err = Packet::Error { message: "User not found".into() };
                                let _ = send_to(&state.connections, id, &err).await;
                            }
                        }

                        Packet::RoomCreate { name } => {
                            info!("Iroh: Starting RoomCreate for {}", name);
                            let room_id = state.room_manager.create_room(name).await;

                            match state.room_manager.join_room(&room_id, id, &state.connections).await {
                                Ok(_)  => {
                                    let resp = Packet::RoomCreated { room_id };
                                    send_to(&state.connections, id, &resp).await;
                                },
                                Err(e) => {
                                    error!("Auto-join failed after room creation: {}", e);
                                    let err = Packet::Error { message: format!("Room created, but join failed: {}", e) };
                                    send_to(&state.connections, id, &err).await;
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
                        
                        
                        Packet::Ping { timestamp } => {
                            let pong = Packet::Pong { timestamp };
                            if let Ok(pong_bytes) = postcard::to_allocvec(&pong) {
                                let mut n = user_noise_inner.lock().await;
                                if let Ok(cipher) = n.encrypt(&pong_bytes) {
                                    let _ = socket_tx_for_loop.send(Bytes::from(cipher));
                                }
                            }
                        }
                        
                        Packet::Error { message } => info!("Client error: {}", message),
                        _ => {}
                    }
                }
            }
            Err(e) => {
                error!("Iroh read error: {}", e);
                break;
            }
        }
    }

    // Cleanup
    state.connections.lock().await.remove(&id);
    broadcast_system(&state.connections, format!("{} left (iroh)", username)).await;
    broadcast_user_list(&state.connections).await;
    writer_task.abort();
    bridge_task.abort();
    
}


// --------------------- CLIENT SIDE --------------------------
#[tauri::command]
pub async fn connect_to_iroh(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<ClientState>>,
    ticket: String,
    nickname: String,
) -> Result<String, String> {
    
    let mut transport_config = iroh::endpoint::TransportConfig::default();
    transport_config.datagram_receive_buffer_size(Some(1024 * 64));
    transport_config.max_idle_timeout(Some(std::time::Duration::from_secs(60).try_into().unwrap()));
    transport_config.keep_alive_interval(Some(std::time::Duration::from_secs(10)));
    
    let endpoint = iroh::Endpoint::builder()
        .alpns(vec![b"chat".to_vec()])
        .transport_config(transport_config)
        .bind()
        .await
        .map_err(|e| format!("Failed to create endpoint: {e}"))?;
    


    let ticket: EndpointTicket = ticket.parse()
    .map_err(|e| format!("Invalid Iroh ticket: {e}"))?;

    let ticket_clone = ticket.clone();
    
    let conn = endpoint
        .connect(ticket, b"chat")
        .await
        .map_err(|e| format!("Failed to connect: {}", e))?;

    // 4. Open thread
    let (send_stream, recv_stream) = conn.open_bi().await
        .map_err(|e| format!("Failed to open stream: {}", e))?;

    let known_hosts = Arc::new(StdMutex::new(security::KnownHosts::load()));
    let last_fp_bridge = Arc::new(StdMutex::new(None));

    let node_id = ticket_clone.endpoint_addr().id;
    let node_id_str = node_id.to_string();
    let node_id_str_c = node_id_str.clone();

    let verifier = Arc::new(security::TofuVerifier {
        known_hosts: known_hosts.clone(),
        last_seen_fingerprint: last_fp_bridge.clone(),
        tofu_key: node_id_str,
    });

    let provider = std::sync::Arc::new(rustls::crypto::ring::default_provider());
    let tls_config = ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .unwrap()
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();

    let connector = TlsConnector::from(Arc::new(tls_config));

    let iroh_stream = IrohRW { send: send_stream, recv: recv_stream };

    let domain = ServerName::try_from("iroh-node").unwrap();

    let tls_stream = match connector.connect(domain, iroh_stream).await {
        Ok(s) => s,
        Err(e) => {
            // Тут сработает ваша логика TOFU, если сертификат новый/изменился
            let fp_opt = last_fp_bridge.lock().unwrap().clone();
            if let Some(fp) = fp_opt {
                 return Err(format!("UNTRUSTED_HOST|{}|{}",node_id_str_c, fp));
            }
            return Err(format!("TLS Error: {}", e));
        }
    };

    let framed = Framed::new(tls_stream, LengthDelimitedCodec::new());
    let (mut framed_writer, mut framed_reader) = framed.split();
    
    let mut noise = NoiseSession::build_noise_client();
    let state_inner = state.inner().clone();
    // 1. Send msg1
    let msg1 = noise.encrypt(&[]).unwrap();
    framed_writer.send(Bytes::from(msg1)).await.map_err(|e| e.to_string())?;

    // 2. Recv msg2
    match framed_reader.next().await {
        Some(Ok(msg2)) => {
            noise.decrypt(&msg2).map_err(|e| format!("Noise msg2 error: {e}"))?;
        }
        _ => return Err("Noise handshake failed at msg2".into()),
    }

    // 3. Send msg3
    let msg3 = noise.encrypt(&[]).unwrap();
    framed_writer.send(Bytes::from(msg3)).await.map_err(|e| e.to_string())?;

    noise.transition_to_transport().map_err(|e| e.to_string())?;
    info!("Iroh Noise Client: Handshake complete");

    *state_inner.noise_session.lock().await = Some(noise);

    // --- REGISTER ---
    let reg_packet = Packet::Register { username: nickname };
    let reg_bytes = postcard::to_allocvec(&reg_packet).map_err(|e| e.to_string())?;

    let mut n_lock = state.noise_session.lock().await;
    let ciphertext = n_lock.as_mut().unwrap().encrypt(&reg_bytes).unwrap();
    drop(n_lock);
    
    framed_writer.send(Bytes::from(ciphertext)).await.map_err(|e| e.to_string())?;

    // --- CHANNEL (UI -> Iroh) ---
    let _state_clone = state.inner().clone();
    let (tx, mut rx) = mpsc::unbounded_channel::<WsMessage>();

    let state_arc = state.inner().clone();
    let _state_arc_s = state.inner().clone();
    let socket_tx_for_hb = tx.clone();
    let app_clone = app.clone();


    tauri::async_runtime::spawn(async move {
        let mut send_interval = tokio::time::interval(Duration::from_secs(5));
        let mut check_interval = tokio::time::interval(Duration::from_secs(2));

        loop {
            tokio::select! {

                _ = send_interval.tick() => {
                    let mut hb = state_arc.heartbeat.lock().await;
                    let seq = hb.next_seq;
                    hb.next_seq += 1;
                    hb.pending.insert(seq, Instant::now());
                    
                    let packet = Packet::Ping { timestamp: seq};
                    let packet_bytes = postcard::to_allocvec(&packet).unwrap();

                    // шифруем через Noise
                    let mut noise_lock = state_arc.noise_session.lock().await;
                    if let Some(noise) = noise_lock.as_mut() {
                        if let Ok(ciphertext) = noise.encrypt(&packet_bytes) {
                            let _ = socket_tx_for_hb.send(WsMessage::Binary(Bytes::from(ciphertext)));
                        }
                    }
                }

                _ = check_interval.tick() => {
                    let mut hb = state_arc.heartbeat.lock().await;
                    let now = Instant::now();
                    let mut expired = 0;

                    hb.pending.retain(|_, sent| {
                        if now.duration_since(*sent) > Duration::from_secs(10) {
                            expired  += 1;
                            false
                        } else {
                            true
                        }
                    });
                    
                    if expired  > 0 {
                        hb.misses += expired;
                        warn!("Heartbeat miss {}", hb.misses);

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
    
    *state_inner.client_tx.lock().await = Some(tx);

    // --- SOCKET -> UI ---
    let app_handle = app.clone();
    let state_for_reader = Arc::clone(&state_inner);
    tauri::async_runtime::spawn(async move {
        while let Some(Ok(bytes)) = framed_reader.next().await {
            record_recv(bytes.len());
            let mut noise_lock = state_for_reader.noise_session.lock().await;
            
            if let Some(noise) = noise_lock.as_mut() {
                if let Ok(plaintext) = noise.decrypt(&bytes) {
                    if let Ok(packet) = postcard::from_bytes::<Packet>(&plaintext) {
                        app_handle.emit("packet-received", &packet).ok();

                        if let Packet::Pong { timestamp: seq } = packet {
                            let mut hb = _state_arc_s.heartbeat.lock().await;
                            if let Some(sent) = hb.pending.remove(&seq) {
                                let rtt = sent.elapsed().as_millis();
                                hb.misses = 0;

                                app_handle.emit("ping-update", rtt).ok();

                                app_handle.emit(
                                    "connection-status",
                                    ConnectionStatus {
                                        connected: true,
                                        heartbeat_misses: 0,
                                    }
                                ).ok();
                            }
                        }
                    }
                }
            }
        }
    });

    // --- UI -> SOCKET ---
    tauri::async_runtime::spawn(async move {
        while let Some(msg) = rx.recv().await {
            
            let bytes_to_send = match msg {
                WsMessage::Binary(b) => Bytes::from(b),
                WsMessage::Text(s) => Bytes::from(s),
                _ => continue,
            };

            record_sent(bytes_to_send.len());
            
            if let Err(_) = framed_writer.send(bytes_to_send).await {
                break;
            }
        }
    });

    Ok("Connected via Iroh".into())
}

// --------------------- WRAPPER --------------------------

pub struct IrohRW {
    pub send: iroh::endpoint::SendStream,
    pub recv: iroh::endpoint::RecvStream,
}

impl AsyncRead for IrohRW {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.recv).poll_read(cx, buf)
    }
}

impl AsyncWrite for IrohRW {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<Result<usize, std::io::Error>> {
        Pin::new(&mut self.send)
            .poll_write(cx, buf)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
    }


    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {

        Pin::new(&mut self.send)
            .poll_flush(cx)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
    }
    

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        
        Pin::new(&mut self.send)
            .poll_shutdown(cx)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
    }
}