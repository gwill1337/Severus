![Rust](https://img.shields.io/badge/rust-%23000000.svg?style=for-the-badge&logo=rust&logoColor=white)
![Tauri](https://img.shields.io/badge/tauri-%2324C8D5.svg?style=for-the-badge&logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)

# Severus

**A self-hosted, lightweight, private messenger.** One person runs a host, everyone else connects to it. No accounts, no cloud, no message history. Messages are end-to-end encrypted between clients.

[Download](https://github.com/gwill1337/Severus/releases/latest) · [Quick start](#quick-start) · [Security](#security-at-a-glance) · [Troubleshooting](#troubleshooting) · [How it works](#how-it-works)

![Severus_host](https://github.com/gwill1337/Images/blob/main/Severus/Severus_host.gif)

## Features

* **Two connection modes.** Direct (IP and port) or QUIC via Iroh (a ticket, no port forwarding).
* **End-to-end encryption between clients.** Every pair of users has its own Noise session. The host relays messages but cannot read them.
* **Safety numbers.** Compare a short code with your contact to prove nobody sits in the middle.
* **Whispers and rooms.** Private messages and group rooms, both encrypted.
* **No accounts, no database.** Pick a nickname and chat. Nothing is stored on disk.
* **Fast and small.** Rust and Tauri 2, with binary serialization instead of JSON.
* **Connection monitoring.** Live ping, bandwidth and active connections.

## Download

Get the latest build from the [Releases page](https://github.com/gwill1337/Severus/releases/latest):

* **Windows:** `-setup.exe` (recommended) or `.msi`
* **macOS:** `.dmg` or `.app` (`aarch64` for Apple Silicon, `x86_64` for Intel)
* **Linux:** `.AppImage` (portable) or `.deb`

> **Important:** the host and every client must run the same major version. Version 2.x is not compatible with 1.x.

## Quick start

Run the app and choose **Host** or **Client**.

### Host

* **Direct:** enter a port and click **Start Host**. Inside a LAN nothing else is needed. For internet access, forward the port on your router and share your public IP ([check it here](https://www.whatismyip.com/)).
* **QUIC:** select QUIC and click **Start Host**. Copy the **ticket** and send it to your friends. No port forwarding is needed.

Keep the host app open. When it closes, everyone is disconnected.

### Connect

* **Direct:** enter `IP:Port` (for example `192.168.1.20:5173`), a nickname, and click **Connect**. If you omit the port, `5173` is used.
* **QUIC:** select QUIC, paste the ticket into the same field, enter a nickname, and click **Connect**.

![Severus_client](https://github.com/gwill1337/Images/blob/main/Severus/Severus_client.gif)

On the first connection you will see a security warning with the host's certificate fingerprint. Ask the host owner to confirm it over another channel, then click **Trust**.

### Chat

* **Whisper:** click a name under **Online Users** and send a message. The first message starts the secure session.
* **Rooms:** create a room, or join one by name or ID. Click the room ID in the header to copy it.
* **Verify your contact:** once the session is ready, a **safety number** appears in the whisper window. Compare it with your contact over a different channel (a call, in person, another messenger). If it matches, nobody is in the middle.

## Security at a glance

Every message is protected by three layers:

| Layer | Between | Purpose |
|---|---|---|
| **End-to-end encryption** (Noise XX) | client ↔ client, relayed by the host | Message contents. The host cannot read them. |
| **Session encryption** (Noise XX) | client ↔ host | Control traffic: user lists, room updates, heartbeats. |
| **TLS** (self-signed, TOFU) | client ↔ host | The whole connection, against network observers. |

**What can each party see?**

| Party | Can see | Cannot see |
|---|---|---|
| Network observer (ISP, Wi-Fi) | Which host you connect to, when, and how much data | Nicknames, messages, rooms |
| The host | Nicknames, who writes to whom, room membership, message sizes and timing | Message contents, as long as you verify safety numbers |
| Other users on the host | Your nickname and that you are online | Messages you send to others |

### Known limitations

* **Not independently audited.** This is a personal project. Read the code before you rely on it.
* **Metadata is visible to the host** (see the table above).
* **The host controls room membership.** A malicious host could add a hidden participant to a room. Verify the people you rely on through their safety numbers.
* **No persistent identity.** Keys are generated per session, so safety numbers change after a reconnect.
* **Older clients are not protected.** Clients older than v2.0.0 send messages the host can read. Update everyone.
* **A compromised device defeats everything.** Malware can read messages before they are encrypted.

## Troubleshooting

* **Cannot connect (Direct)?** Check that the host is running, the port is correct, the firewall allows it, and port forwarding is set up. Over the internet, use the host's public IP.
* **Reset keys and trust.** Delete these files (they live next to the executable):
  * **Client:** `known_hosts.json`
  * **Host:** `cert.pem` and `key.pem` (new ones are created on the next start)
* **Fingerprint warning for a host you already trusted?** The host probably regenerated its certificate. Confirm the new fingerprint with the host owner before you trust it.
* **No safety number, or messages do not arrive?** Make sure the host and all clients run the same version.
* **QUIC is slow or does not connect.** QUIC can add slight latency and may fail behind strict NAT (reflective NAT, hairpinning) or complex networks. Try Direct mode.

## Build from source

Requirements: [Rust](https://www.rust-lang.org/tools/install), [Node.js](https://nodejs.org/) and the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
npm install
npm run tauri dev      # development
npm run tauri build    # release build with installers
```

Use `npm run tauri build` and not a plain `cargo build`: only Tauri's build embeds the frontend into the executable. To run the Rust tests: `cd src-tauri && cargo test`.

---

# How it works

Everything below is technical background.

## Connection modes

| Mode | Transport | NAT |
|---|---|---|
| **Direct** | WebSocket over TLS over TCP | Needs port forwarding, or a LAN |
| **QUIC (Iroh)** | Bidirectional QUIC stream carrying the same TLS and Noise layers | NAT traversal through a ticket |

QUIC has its own TLS. Severus adds its custom TLS layer on top, so both modes share the same security model and the same packet protocol.

## Encryption layers

```
Client A ──[ E2EE: Noise XX with Client B ]───────────────────────────┐
         └─[ Session: Noise XX with host ]─[ TLS ]── network ── Host ─┴─ relays ciphertext ── Client B
```

Both Noise layers use `Noise_XX_25519_ChaChaPoly_SHA256` (the [`snow`](https://crates.io/crates/snow) crate). The wrapper lives in [`security.rs`](https://github.com/gwill1337/Severus/blob/main/src-tauri/src/security.rs).

### End-to-end sessions between clients

Implemented in [`net/e2e.rs`](https://github.com/gwill1337/Severus/blob/main/src-tauri/src/net/e2e.rs). The host never takes part in these handshakes: it forwards opaque bytes and stamps the sender's `id` on each packet so a client cannot spoof it.

1. Client A sends `E2eHandshake { step: 1 }` (Noise msg1) to B. The host sets `from` and relays it.
2. B replies with msg2 (`step: 2`). A answers with msg3 (`step: 3`). Both sides switch to transport mode.
3. Both compute the same **safety number** from the two static public keys.
4. Messages travel as `E2eData`. Messages sent before the session is ready wait in a queue.

Details:

* **Simultaneous start.** If A and B begin a handshake at the same time, the client with the smaller `Uuid` stays the initiator.
* **Rooms.** A room message is encrypted separately for each member and sent as one `E2eData` per recipient. The sender shows its own copy locally. Members of a room are tracked from `RoomSync` packets, and a receiver rejects messages from non-members.
* **Safety number.** SHA-256 of both public keys in sorted order, first 15 bytes, hex, in groups of five:

```rust
pub fn safety_number(a: &[u8], b: &[u8]) -> String {
    let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
    let mut h = Sha256::new();
    h.update(lo);
    h.update(hi);
    let digest = h.finalize();
    hex::encode(&digest[..15])
        .as_bytes()
        .chunks(5)
        .map(|c| std::str::from_utf8(c).unwrap())
        .collect::<Vec<_>>()
        .join(" ")
}
```

Noise XX does not authenticate identities by itself. Without comparing safety numbers, an active malicious host could run two separate sessions and sit in the middle. This is the same trade-off as in Signal or WhatsApp.

## TLS and TOFU

Certificates and keys are generated on first launch (`cert.pem`, `key.pem`): **ECDSA P-256**, self-signed.

On the first connection the client stores the SHA-256 fingerprint of the host certificate in `known_hosts.json` after you confirm it. Later connections must present the same fingerprint, otherwise the handshake fails and you are asked to confirm again. The key is the host address in Direct mode and the node ID in QUIC mode.

```rust
let tls_stream = match connector.connect(domain, tcp_stream).await {
    Ok(stream) => stream,
    Err(err) => {
        let fp = last_fp_bridge.lock().unwrap().clone().unwrap_or_default();
        if fp.is_empty() {
            return Err(format!("TLS_HANDSHAKE_FAILED|{:?}", err));
        }
        return Err(format!("UNTRUSTED_HOST|{}|{}", host, fp));
    }
};
```

## Packets

Everything on the wire is a Rust `enum` encoded with [postcard](https://crates.io/crates/postcard) (binary, no JSON). The full definition is in [`net/mod.rs`](https://github.com/gwill1337/Severus/blob/main/src-tauri/src/net/mod.rs).

```rust
pub enum Packet {
    Register { username: String },
    UserList { users: Vec<(String, String)> },
    Message { from_id: Uuid, from_username: String, body: String, room_id: Option<String> },
    // ... rooms, ping/pong, heartbeat, errors ...

    // End-to-end encryption (v2)
    Welcome { id: Uuid },
    E2eHandshake { to: Uuid, from: Uuid, step: u8, data: Vec<u8> },
    E2eData { to: Uuid, from: Uuid, data: Vec<u8> },
}
```

New variants are appended at the end, because postcard identifies variants by index. The frontend receives decrypted `Message` packets, so it does not need to know about the E2E packets.

The client sends a `Ping` every 5 seconds. After three missed answers the connection is reported as lost.

## Tech stack and layout

* **Backend:** Rust (host and client logic), tokio, axum, rustls, snow, iroh
* **Frontend:** Tauri 2, React, TypeScript, Tailwind 4 ([`App.tsx`](https://github.com/gwill1337/Severus/blob/main/src/App.tsx))

```
src-tauri/src/
├── lib.rs          # app entry, host mode, command registration
├── security.rs     # TLS certs, TOFU verifier, Noise wrapper, safety numbers
├── logger.rs       # bandwidth and connection metrics
└── net/
    ├── mod.rs      # Packet enum, shared state, broadcast helpers
    ├── direct.rs   # Direct mode: WebSocket host and client
    ├── quic.rs     # QUIC (Iroh) host and client
    ├── room.rs     # rooms
    └── e2e.rs      # client-to-client Noise sessions
```

## Design decisions

* **No Double Ratchet.** It is overkill for a lightweight, ephemeral session. Noise XX with fresh keys per session is enough for this use case.
* **No database.** Messages are never written to disk. This keeps the app stateless and focused on real-time privacy.
* **Per-member encryption in rooms.** Simpler than a shared room key (no key distribution or rotation), at the cost of more work in very large rooms.
* **Host as relay.** The host is a message router, not a trusted party: it sees metadata but not contents.

## Roadmap

* Persistent identity keys, so safety numbers stay stable between sessions
* Client-side verification of room membership
* Dropping support for plaintext packets from pre-2.0 clients
* Independent security review

## About this project

I built Severus to demonstrate my proficiency in **Rust**, **networking**, **full-stack development**, **system architecture** and **protocols**.