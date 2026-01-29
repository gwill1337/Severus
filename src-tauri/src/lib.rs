use tokio_rustls::TlsAcceptor;
use tracing::{info,error};
use rustls::ServerConfig;
use axum_server::tls_rustls::RustlsConfig;
use iroh::Endpoint;
use iroh_tickets::endpoint::EndpointTicket;
use tokio::sync::Mutex as AsyncMutex;

use axum::{
    Router,
    routing::{get},
};

use std::{
    collections::{HashMap},
    net::{SocketAddr},
    sync::{Arc},
};
// --------------------- MODS --------------------------
mod logger;
mod security;
mod net;

use crate::net::room::{create_room, join_room,leave_room, send_room_message_cmd};
use crate::net::{ClientState, HeartbeatState, RoomManager, ServerState};
use crate::net::direct::{ws_handler};

#[tauri::command]
async fn start_host_mode(
    state: tauri::State<'_, Arc<ServerState>>,
    port: String,
    connection_type: String
) -> Result<String, String> {
    info!("Host mode requested: type={connection_type}, port={port}");
    let provider = std::sync::Arc::new(rustls::crypto::ring::default_provider());

    let mut running = state.running.lock().await;

    let server_state_arc = state.inner().clone();

    if connection_type == "direct" {

        let (certs, key) = security::load_or_generate_cert("0.0.0.0".to_string());

        let mut server_config = ServerConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()
            .expect("Failed to set protocols")
            .with_no_client_auth()
            .with_single_cert(certs, key)
            .map_err(|e| {
                error!("Failed to create ServerConfig: {:?}", e);
                e.to_string()
            })?;

        server_config.alpn_protocols = vec![b"http/1.1".to_vec()];
        let port_num: u16 = port.parse().map_err(|_| "Invalid port number")?;

        let addr = SocketAddr::from(([0, 0, 0, 0], port_num));

        let config = RustlsConfig::from_config(Arc::new(server_config));

        *running = true;
        tauri::async_runtime::spawn(async move {
            let app = Router::new()
                .route("/ws", get(ws_handler))
                .with_state(server_state_arc);


            if let Err(e) = axum_server::bind_rustls(addr, config)
                .serve(app.into_make_service())
                .await
            {
                error!("TLS server failed to start: {e}");
            }
        });
        info!("Server is up...");
        return Ok("Server is up...".into())


    } else if connection_type == "quic" {

        let mut transport_config = iroh::endpoint::TransportConfig::default();
        transport_config.datagram_receive_buffer_size(Some(1024 * 64));
        transport_config.max_idle_timeout(Some(std::time::Duration::from_secs(60).try_into().unwrap()));
        transport_config.keep_alive_interval(Some(std::time::Duration::from_secs(10)));
        let endpoint = Endpoint::builder()
            .alpns(vec![b"chat".to_vec()])
            .transport_config(transport_config)
            .bind()
            .await
            .map_err(|e| e.to_string())?;


        let node_id = endpoint.id();
        let addr = endpoint.addr();
        let ticket = EndpointTicket::new(addr);
        let ticket = ticket.to_string();
        
        
        let server_state = state.inner().clone();

        let (certs, key) = security::load_or_generate_cert(node_id.to_string());
        let provider = std::sync::Arc::new(rustls::crypto::ring::default_provider());

        let server_config = ServerConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_no_client_auth()
            .with_single_cert(certs, key)
            .map_err(|e| e.to_string())?;

        let tls_acceptor = TlsAcceptor::from(Arc::new(server_config));

        *running = true;


        tauri::async_runtime::spawn(async move {
            while let Some(incoming) = endpoint.accept().await {
                let state_for_conn = server_state.clone();
                let acceptor_outer: TlsAcceptor = tls_acceptor.clone();

                tokio::spawn(async move {
                    if let Ok(conn) = incoming.await {
                        while let Ok((send, recv)) = conn.accept_bi().await {
                            let a_clone = acceptor_outer.clone();
                            net::quic::handle_iroh_socket(send, recv, state_for_conn.clone(), a_clone).await;
                        }
                    }
                });
            }
        });

        return Ok(ticket);

    } else {
        return Ok("Server is dont up...".into())
    }
    
}


// --------------------- Run --------------------------
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    
    // logger::init_logging();

    info!("Application starting...");
    

    let connections = Arc::new(AsyncMutex::new(HashMap::new()));
    let running = Arc::new(AsyncMutex::new(false));
    let room_manager = Arc::new(RoomManager::new());

    let client_state = Arc::new(ClientState {
        client_tx: AsyncMutex::new(None),
        noise_session: Default::default(),
        heartbeat: AsyncMutex::new(
            HeartbeatState {
                next_seq: 0,
                pending: HashMap::new(),
                misses: 0,
            }
        ),
    });
    let server_state = Arc::new(ServerState {
        connections,
        running,
        room_manager,
    });
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(server_state)
        .manage(client_state)
        .invoke_handler(tauri::generate_handler![
            start_host_mode,
            net::direct::connect_to_server,
            net::direct::send_packet,
            security::confirm_host,
            net::quic::connect_to_iroh,
            logger::set_monitoring_status,
            create_room,
            join_room,
            send_room_message_cmd,
            leave_room,
        ]) 
        .setup(|app| {
            let handle = app.handle().clone();
            logger::start_metrics_loop(handle);
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}