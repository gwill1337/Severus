use serde::{Deserialize, Serialize};
use rustls::client::danger::{ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{
    CertificateDer,
    ServerName,
    UnixTime,
    PrivateKeyDer
};
use rcgen::{
    CertificateParams,
    KeyPair,
    PKCS_ECDSA_P256_SHA256
};

use sha2::{Sha256, Digest};
use rustls_pemfile;

use snow::{
    HandshakeState,
    TransportState,
    Builder,
    params::NoiseParams,
};

use std::{
    fs,
    path::Path,
    sync::{Arc, Mutex as StdMutex},
    collections::HashMap,
};

// --------------------- STRUCTS --------------------------
#[derive(Default, Serialize, Deserialize)]
pub struct KnownHosts {
    hosts: HashMap<String, String>,
}

pub struct TofuVerifier {
    pub known_hosts: Arc<StdMutex<KnownHosts>>,
    pub last_seen_fingerprint: Arc<StdMutex<Option<String>>>,
    pub tofu_key: String,
}

pub struct NoiseSession {
    pub state: NoiseState,
}

pub enum NoiseState {
    Handshake(HandshakeState),
    Transport(TransportState),
    Empty,
}

// --------------------- IMPLEMENTATIONS --------------------------

impl KnownHosts {
    pub fn load() -> Self {
        let path = Path::new("known_hosts.json");
        if path.exists() {
            let data = fs::read_to_string(path).unwrap_or_default();
            serde_json::from_str(&data).unwrap_or_default()
        } else {
            Self::default()
        }
    }

    pub fn save(&self) {
        let data = serde_json::to_string_pretty(self).unwrap();
        fs::write("known_hosts.json", data).ok();
    }
}

impl std::fmt::Debug for TofuVerifier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TofuVerifier").finish()
    }
}

impl ServerCertVerifier for TofuVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        let mut hasher = Sha256::new();
        hasher.update(end_entity.as_ref());

        let current_fingerprint = hex::encode(hasher.finalize());

        {
            let mut last_fp = self.last_seen_fingerprint.lock().unwrap();
            *last_fp = Some(current_fingerprint.clone());
        };

        self.last_seen_fingerprint
            .lock().unwrap()
            .replace(current_fingerprint.clone());

        let host = self.tofu_key.clone();

        let hosts_lock = self.known_hosts.lock().unwrap();
        if let Some(saved_fingerprint) = hosts_lock.hosts.get(&host) {
            if saved_fingerprint == &current_fingerprint {
                Ok(ServerCertVerified::assertion())
            } else {
                Err(rustls::Error::InvalidCertificate(rustls::CertificateError::NotValidForName))
            }
        } else {
            Err(rustls::Error::General("UnknownHost".to_string()))
        }
    }

    fn verify_tls12_signature(&self, _m: &[u8], _c: &CertificateDer<'_>, _d: &rustls::DigitallySignedStruct) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(&self, _m: &[u8], _c: &CertificateDer<'_>, _d: &rustls::DigitallySignedStruct) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        vec![rustls::SignatureScheme::ECDSA_NISTP256_SHA256, rustls::SignatureScheme::RSA_PSS_SHA256]
    }
}


// --------------------- FUNCTIONS --------------------------

#[tauri::command]
pub async fn confirm_host(ip: String, fingerprint: String) -> Result<(), String> {
    let mut known = KnownHosts::load();
    known.hosts.insert(ip, fingerprint);
    known.save();
    Ok(())
}

pub fn load_or_generate_cert(node_id: String) -> (Vec<CertificateDer<'static>>, PrivateKeyDer<'static>) {
    let cert_path = "cert.pem";
    let key_path = "key.pem";

    if Path::new(cert_path).exists() && Path::new(key_path).exists() {
        let cert_bytes = fs::read(cert_path).unwrap();
        let key_bytes = fs::read(key_path).unwrap();
        
        let mut cert_reader = std::io::BufReader::new(&cert_bytes[..]);
        let certs = rustls_pemfile::certs(&mut cert_reader).map(|c| c.unwrap()).collect();
        
        let mut key_reader = std::io::BufReader::new(&key_bytes[..]);
        let key = rustls_pemfile::private_key(&mut key_reader).unwrap().unwrap();
        
        return (certs, key);
    }


    let key_pair = KeyPair::generate_for(&PKCS_ECDSA_P256_SHA256).unwrap();
    let params = CertificateParams::new(vec![
        node_id.clone(),
    ]).unwrap();
    let cert = params.self_signed(&key_pair).unwrap();

    fs::write(cert_path, cert.pem()).ok();
    fs::write(key_path, key_pair.serialize_pem()).ok();

    (vec![cert.der().clone()], PrivateKeyDer::Pkcs8(key_pair.serialize_der().into()))
}


impl NoiseSession  {
    pub fn build_noise_client() -> Self {
        let params: NoiseParams = "Noise_XX_25519_ChaChaPoly_SHA256".parse().unwrap();
        let builder = Builder::new(params);
        let static_key = builder.generate_keypair().unwrap().private;
        
        let initiator = builder
            .local_private_key(&static_key)
            .expect("Invalid private key")
            .build_initiator()
            .expect("Failed to build Noise initiator. Check if all keys are provided.");
        Self { state: NoiseState::Handshake(initiator) }
    }

    pub fn build_noise_server() -> Self {
        let params: NoiseParams = "Noise_XX_25519_ChaChaPoly_SHA256".parse().unwrap();

        let builder = Builder::new(params);
        let static_key = builder.generate_keypair().unwrap().private;
        let responder = builder
            .local_private_key(&static_key)
            .expect("Invalid private key")
            .build_responder()
            .expect("Failed to build Noise responder");
        Self { state: NoiseState::Handshake(responder) }
    }

    pub fn encrypt(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, String> {
        let mut buf = vec![0u8; plaintext.len() + 1024]; // Запас под тег и прочее
        let len = match &mut self.state {
            NoiseState::Handshake(hs) => hs.write_message(plaintext, &mut buf).map_err(|e| e.to_string())?,
            NoiseState::Transport(transport) => transport.write_message(plaintext, &mut buf).map_err(|e| e.to_string())?,
            NoiseState::Empty => return Err("Session is empty".into()),
        };
        buf.truncate(len);
        Ok(buf)
    }

    pub fn decrypt(&mut self, ciphertext: &[u8]) -> Result<Vec<u8>, String> {
        let mut buf = vec![0u8; ciphertext.len() + 1024];
        let len = match &mut self.state {
            NoiseState::Handshake(hs) => hs.read_message(ciphertext, &mut buf).map_err(|e| e.to_string())?,
            NoiseState::Transport(transport) => transport.read_message(ciphertext, &mut buf).map_err(|e| e.to_string())?,
            NoiseState::Empty => return Err("Session is empty".into()),
        };
        buf.truncate(len);
        Ok(buf)
    }

    pub fn transition_to_transport(&mut self) -> Result<(), String> {
        let current = std::mem::replace(&mut self.state, NoiseState::Empty);

        match current {
            NoiseState::Handshake(hs) => {
                if !hs.is_handshake_finished() {
                    self.state = NoiseState::Handshake(hs);
                    return Err("Handshake not finished".into());
                }
                let transport = hs.into_transport_mode().map_err(|e| e.to_string())?;
                self.state = NoiseState::Transport(transport);
                Ok(())
            }
            _ => {
                self.state = current;
                Ok(())
            }
        }
    }
}