use tauri::{Emitter};

// use tracing::{
//     Subscriber,
//     field::{Field, Visit},
// };

// use tracing_appender::{
//     rolling,
//     non_blocking::{WorkerGuard},
// };

// use tracing_subscriber::{
//     EnvFilter,
//     Layer,
//     fmt,prelude::*,
//     registry::LookupSpan,
// };

// use tracing_subscriber::{fmt, prelude::*};

use std::sync::{
    // Once,
    atomic::{AtomicU64, Ordering, AtomicBool},
};


// --------------------- STRUCTS & IMPLEMENTATIONS --------------------------
// struct SensitiveFilterLayer;
// struct SensitiveVisitor {
//     has_sensitive: bool,
// }

#[derive(serde::Serialize, Clone)]
struct BandwidthPayload {
    upload: u64,
    download: u64,
    active_connections: u64,
}

pub struct ConnectionGuard;

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        connection_closed();
    }
}


// impl Visit for SensitiveVisitor {
//     fn record_debug(&mut self, field: &Field, _value: &dyn core::fmt::Debug) {
//         let name = field.name();
//         if matches!(name, "packet" | "ciphertext" | "plaintext" | "key") {
//             self.has_sensitive = true;
//         }
//     }
// }

// impl<S> Layer<S> for SensitiveFilterLayer
// where 
//     S: Subscriber + for<'a> LookupSpan<'a>,
// {
//     fn on_event(&self, _event: &tracing::Event<'_>, _ctx: tracing_subscriber::layer::Context<'_, S>) {
//         let mut visitor = SensitiveVisitor {
//             has_sensitive: false,
//         };

//         _event.record(&mut visitor);

//         if visitor.has_sensitive {
//             return;
//         }
//     }
// }


// --------------------- STATIC --------------------------
    // METRICS
static SENT_BYTES: AtomicU64 = AtomicU64::new(0);
static RECV_BYTES: AtomicU64 = AtomicU64::new(0);
static CONNECTIONS_ACTIVE: AtomicU64 = AtomicU64::new(0);
static MONITORING_ENABLED: AtomicBool = AtomicBool::new(false);
    // LOGGING
// static INIT: Once = Once::new();
// static mut LOG_GUARD: Option<WorkerGuard> = None;

// --------------------- FUNCTIONS & COMMANDS --------------------------

// pub fn init_logging() {
//     INIT.call_once(|| {
//         let file_appender = rolling::daily("logs", "app.log");
//         let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

//         unsafe {
//             LOG_GUARD = Some(_guard);
//         }
        
//         let env_filter = EnvFilter::try_from_default_env()
//             .unwrap_or_else(|_| {
//                 EnvFilter::new("info,app_lib=trace,axum=info,app_lib::net::direct,hyper=warn,iroh=error")
//             });

//         // let dynamic_logger_filter = filter_fn(|_| {
//         //     LOGGING_ENABLED.load(Ordering::Relaxed)
//         // });

//         tracing_subscriber::registry()
//             .with(env_filter)
//             .with(SensitiveFilterLayer)
//             .with(
//                 fmt::layer()
//                     .with_writer(non_blocking)
//                     .with_ansi(false)
//                     .with_target(true)
//                     .with_thread_ids(true)
//                     .with_line_number(true)
//                     .with_file(true),
//             )
//             .with(
//                 fmt::layer()
//                     .with_writer(std::io::stdout)
//                     .with_ansi(true),
//             )
//             .init();
//     });
// }


pub fn record_sent(n: usize) {
    if MONITORING_ENABLED.load(Ordering::Relaxed) {
        SENT_BYTES.fetch_add(n as u64, Ordering::Relaxed);
    }
}

pub fn record_recv(n: usize) {
    if MONITORING_ENABLED.load(Ordering::Relaxed) {
        RECV_BYTES.fetch_add(n as u64, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn set_monitoring_status(enabled: bool) {
    MONITORING_ENABLED.store(enabled, Ordering::Relaxed);

    if !enabled {
        SENT_BYTES.store(0, Ordering::Relaxed);
        RECV_BYTES.store(0, Ordering::Relaxed);
    }
}

// #[tauri::command]
// pub fn set_logging_status(enabled: bool) {
//     LOGGING_ENABLED.store(enabled, Ordering::Relaxed);
//     println!("Logging status changed to: {}", enabled);
// }

// pub fn connection_opened() {
//     if MONITORING_ENABLED.load(Ordering::Relaxed) {
//         CONNECTIONS_ACTIVE.fetch_add(1, Ordering::Relaxed);
//     }
// }

pub fn connection_opened() {
    CONNECTIONS_ACTIVE.fetch_add(1, Ordering::Relaxed);
}


pub fn connection_closed() {
    let _ = CONNECTIONS_ACTIVE.fetch_update(Ordering::Relaxed, Ordering::Relaxed, |val| {
        if val > 0 { Some(val - 1) } else { Some(0) }
    });
}


pub fn start_metrics_loop(app_handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
        loop {
            interval.tick().await;

            if !MONITORING_ENABLED.load(Ordering::Relaxed) {
                continue;
            }

            let active = CONNECTIONS_ACTIVE.load(Ordering::Relaxed);
            
            let sent = SENT_BYTES.swap(0, Ordering::Relaxed);
            let recv = RECV_BYTES.swap(0, Ordering::Relaxed);

            // Отправляем данные во фронтенд
            let _ = app_handle.emit("network-speed", BandwidthPayload {
                upload: sent,
                download: recv,
                active_connections: active,
            });
        }
    });
}