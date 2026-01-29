![Rust](https://img.shields.io/badge/rust-%23000000.svg?style=for-the-badge&logo=rust&logoColor=white)
![Tauri](https://img.shields.io/badge/tauri-%2324C8D5.svg?style=for-the-badge&logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)

# Self hosted messenger - Severus
After few weeks of working on this project, I'm happy to present **"Severus"** or **"Self hosted  lightweight private P2P messenger"** that offers **2 mods of connection**, own **TLS** and **E2EE** *(End to End Encryption)*. You simply need to run the app, choose "Host" or "Client" and start chatting.   
> **NOTE:** I Built this project to demonstrate my proficiency in **Rust**, **Networking**, **FullStack development**, **System Architecture**, and **Protocols**.
### Below are links to the sections:
* [Network Part](#network-part)
* [TLS](#tls)
* [E2EE (Noise)](#e2ee-noise-protocol)
* [Security](#security)
* [System Architecture](#system-architecture)
* [Setup Guide](#setup-guide)
* [Troubleshooting](#troubleshooting)
* [Moved away from](#moved-away-from)

## Network Part
In this sections will be **"How P2P connection works"**, **"Serialization and Deserialization"** and **More**.

## How works P2P connection:
Severus offers two ways to connect Clients and Hosts:
1. **Direct Connection** (TCP/LAN)
2. **Iroh** (QUIC Protocol)

### Direct:
Requires **Port Forwarding** on your router or usage within a LAN.
* To connect via the internet, use the Host's **Public IP**. You can check your IP [Here](https://www.whatismyip.com/).


### Iroh(Quic):
Utilizes the QUIC protocol for NAT traversal.
* **How to use:** Run the app, select **Quic** mode on the Host, and generate a **Ticket**. The Client simply pastes this Ticket into the IP input field.
* **Tech:** QUIC (Quick UDP Internet Connections) is a modern, encrypted transport layer protocol. While it includes native TLS, I have implemented an additional custom TLS layer on top for enhanced security and learning purposes.


## TLS
I implemented a custom TLS configuration that auto-generates Certificates and Keys upon first launch.
* **Keys:** PKCS ECDSA P256 SHA256.
* **Certificates:** Self-signed.

You can see the certificate generation logic [here](https://github.com/gwill1337/Severus/blob/main/src-tauri/src/security.rs).
For Keys I used PKCS ECDSA P256 SHA256 and self signed certs.
```rust
    let key_pair = KeyPair::generate_for(&PKCS_ECDSA_P256_SHA256).unwrap();
    let params = CertificateParams::new(vec![
        node_id.clone(),
    ]).unwrap();
    let cert = params.self_signed(&key_pair).unwrap();
```
**Generation Example:**
```rust
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
```
 **Client-side Validation:** The client checks the server's fingerprint (TOFU model).
```rust
    tauri::async_runtime::spawn(async move {
            let app = Router::new()
                .route("/ws", get(ws_handler))
                .with_state(server_state_arc);

            // ... fingerprint verification logic ...
            if let Err(e) = axum_server::bind_rustls(addr, config)
                .serve(app.into_make_service())
                .await
            {
                error!("TLS server failed to start: {e}");
            }
        });
```

## E2EE (Noise Protocol)
For End-to-End Encryption, I implemented the **Noise Protocol** using the `Noise_XX_25519_ChaChaPoly_SHA256` pattern. You can find the implementation [here](https://github.com/gwill1337/Severus/blob/main/src-tauri/src/security.rs).
And few lines how it works Noise Handshake on Client side:

### Handshake Logic (Client Side):
```rust
    // 1. Encrypt and send first handshake message
    let msg1 = noise.encrypt(&[]).map_err(|e| format!("Noise encrypt msg1 error: {}", e))?;
    ws_tx.send(WsMessage::Binary(msg1.into())).await.map_err(|e| e.to_string())?;
    info!("Noise Client: Sent msg1");

    // 2. Receive and decrypt response
     match ws_rx.next().await {
        Some(Ok(WsMessage::Binary(msg2))) => {
            noise.decrypt(&msg2).map_err(|e| format!("Noise decrypt msg2 error: {}", e))?;
        }
        // ... error handling ...
    }

    // 3. Complete handshake
    let msg3 = noise.encrypt(&[]).map_err(|e| format!("Noise encrypt msg3 error: {}", e))?;
    ws_tx.send(WsMessage::Binary(msg3.into())).await.map_err(|e| e.to_string())?;
    info!("Noise Client: Sent msg3");
```
## Security
Severus uses **TOFU (Trust On First Use)** to protect from **MITM** attacks.   

Severus P2P connection architecture looks like:  
client A -> `Serialize` -> **E2EE** -> **TLS** -> `ISP/Internet` -> **TLS** -> **E2EE** -> `Deserialize` -> *client B*.     
Any interceptor (ISP or hacker) will only see encrypted ciphertext like (Noise_XX with ChaChaPoly + Poly1305). Even if TLS is compromised, the inner E2EE layer protects the message content.

## System Architecture
Main idea for **Severus** was, **strict**, **prettily**, **performant** and **safe** self host messenger, which anyone can **deploy**.


#### Tech Stack
* **Backend:** Rust (Host and Client logic)
* **Frontend:** Tauri 2 + Tailwind 4 + React + TypeScript [(Frontend Code Here)](https://github.com/gwill1337/Severus/blob/main/src/App.tsx)

#### Data Transport
To ensure speed and lightweight performance, Severus uses binary **Serialization/Deserialization** instead of sending heavy JSON strings over the wire.

**Packet Structure:** I use a Rust `enum` for type-safe packet handling: you can find out entire enum [here](https://github.com/gwill1337/Severus/blob/main/src-tauri/src/net/mod.rs):
```rust
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
    .....
```
This makes packet processing easier as on frontend and backend.

## Setup Guide
1. For set up just run `Severus.exe` you can find it [here](https://github.com/gwill1337/Severus/tree/main/App).
### Hosting:
* **Direct:** Configure Port Forwarding, enter your port, and click **Start Host**.
* **QUIC:** Select Quic mode, click **Start Host**, copy the **Ticket**, and send it to your friend.

![Severus_host](https://github.com/gwill1337/Images/blob/main/Severus/Severus_host.gif)


### Connecting (Client)
#### **via Direct:**
* **Direct:** Enter `IP:Port` (e.g., `172.0.0.1:3000`), enter a Nickname, and click **Connect**.
* **QUIC:** Select Quic mode, paste the Ticket (instead of IP), enter a Nickname, and click **Connect**.

    **Note:** On the first connection, you will see a Security Warning (TOFU). Verify the fingerprint with the host if possible, then click **Trust**.     
    
![Severus_client](https://github.com/gwill1337/Images/blob/main/Severus/Severus_client.gif)

## Troubleshooting
* Connection Issues: If you cannot connect, try deleting the configuration files to reset keys/trust:
   * **Client:** Delete `known_hosts.json`.
   * **Host:** Delete `cert.pem` and `key.pem`.
* If you connect via Quic, there sometimes can be a little bit ping, because Quic protocol and Iroh works like this. It might doesn't work if you have, hard/complex NAT (Reflective NAT, NAT Loopback/Hairpinning) or if you're under complex infrastructure.

## Moved away from
1. **Double Ratchet:** I decided against the Double Ratchet algorithm (used in Signal) as it is overkill for a lightweight, ephemeral P2P session. Noise_XX provides sufficient security for this use case.
2. **No Database:** I deliberately avoided using a database for message history to keep the application stateless, lightweight, and focused on real-time privacy.
