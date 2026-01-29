import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/* ================= TYPES ================= */

type Mode = "menu" | "host" | "client";

interface User {
  id: string;
  username: string;
}

type ConnectionStatus = {
  connected: boolean;
  heartbeat_misses: number;
};

type Packet =
  | { system: { message: string } }
  | { userList: { users: [string, string][] } }
  | { message: { from_id: string; from_username: string; body: string; room_id?: string | null; } }
  | { roomCreated: { room_id: string } }
  | { roomCreate: { name: string } }
  | { roomJoin: { room_id: string } }
  | { roomLeave: { room_id: string }  }
  | { roomSync: { room_id: string; room_name: string; users: { id: string; username: string }[] } };

type Dialogs = {
  [userId: string]: { from_username: string; body: string }[];
};

/* ================= APP ================= */

export default function App() {

  /* ================= MAIN CONSTS ================= */
  const [mode, setMode] = useState<Mode>("menu");
  const [status, setStatus] = useState("");

  const [ip, setIp] = useState("127.0.0.1");

  const [untrustedFp, setUntrustedFp] = useState<string | null>(null);

  const [showNickInput, setShowNickInput] = useState(false);
  const [nickname, setNickname] = useState("");

  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  const [dialogs, setDialogs] = useState<Dialogs>({});
  const [msgInput, setMsgInput] = useState("");

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showHostInput, setShowHostInput] = useState(false);

  const [hostPort, setHostPort] = useState("");
  const [hostConnectionType, setHostConnectionType] = useState<'direct' | 'quic'>('direct');
  const [connectionType, setConnectionType] = useState<'direct' | 'quic'>('direct');

  const [quicTicket, setQuicTicket] = useState<string | null>(null);
  const [showTicketModal, setShowTicketModal] = useState(false);

  /* ================= MONITORING CONSTS ================= */
  const [ping, setPing] = useState(0);
  const [monitoring, setMonitoring] = useState(false);
  const [speed, setSpeed] = useState({ upload: 0, download: 0 });
  const [activeConnections, setActiveConnections] = useState<number>(0);

  const [connStatus, setConnStatus] = useState<ConnectionStatus>({
    connected: false,
    heartbeat_misses: 0,
  });

  /* ================= ROOM CONSTS ================= */
  const [roomName, setRoomName] = useState("");
  const [roomIdToJoin, setRoomIdToJoin] = useState("");
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoomName, setActiveRoomName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const activeRoomIdRef = useRef(activeRoomId);
  const roomIdToJoinRef = useRef(roomIdToJoin);

  const [roomUsers, setRoomUsers] = useState<User[]>([]);
  const [globalUsers, setGlobalUsers] = useState<User[]>([]);

  /* ================= HELPERS ================= */

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);

      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy error:", err);
    }
  };

  const handleCreate = async () => {
    if (!roomName.trim()) return;
    try {
      setRoomIdToJoin(roomName);

      await invoke("send_packet", { 
        packet: { roomCreate: { name: roomName } } 
      });
      setRoomName("");
      setActiveUserId(null);
    } catch (e) {
      console.error("Send error:", e);
    }
  };

  const handleJoin = async () => {
    try {
      await invoke("send_packet", { 
        packet: { roomJoin: { room_id: roomIdToJoin } } 
      });
      setActiveUserId(null);
      setRoomIdToJoin("");
    } catch (e) {
      console.error("Send error:", e);
    }
  };

  const handleLeave = async () => {
    if (!activeRoomId) return;
    try {
      await invoke("send_packet", { 
        packet: { roomLeave: { room_id: activeRoomId } } 
      });
      setActiveRoomId(null);
      setActiveRoomName(null);
    } catch (e) {
      console.error("Send error:", e);
    }
  };

  const [warnToast, setWarnToast] = useState<{
    message: string;
    onTrust?: () => void;
    onCancel?: () => void;
  } | null>(null);

  const connectionState =
    !connStatus.connected
      ? "offline"
      : connStatus.heartbeat_misses > 3
      ? "bad"
      : "ok";

  const showWarn = (
    message: string,
    onTrust?: () => void,
    onCancel?: () => void
  ) => {
    setWarnToast({ message, onTrust, onCancel });

    setTimeout(() => {
      setWarnToast(null);
    }, 5000);
  };


  const handleToggleMonitoring = async () => {
    const nextState = !monitoring;
    setMonitoring(nextState);
    
    try {
      await invoke("set_monitoring_status", { enabled: nextState });
    } catch (err) {
      console.error("Error updating monitoring status:", err);
    }
  };


  /* ================= SOCKET ================= */
  useEffect(() => { activeRoomIdRef.current = activeRoomId; }, [activeRoomId]);
  useEffect(() => { roomIdToJoinRef.current = roomIdToJoin; }, [roomIdToJoin]);

  useEffect(() => {
    const unlisten = listen<ConnectionStatus>(
      "connection-status",
      (event) => {
        setConnStatus(event.payload);
      }
    );

    return () => {
      unlisten.then(f => f());
    };
  }, []);
  
  useEffect(() => {
    const unlisten = listen<number>("ping-update", (event) => {
      setPing(event.payload);
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);
  
  useEffect(() => {
    const unlisten = listen("network-speed", (event: any) => {
      const { upload, download, active_connections } = event.payload;
      setSpeed({
        upload: upload,
        download: download
      });
      setActiveConnections(active_connections);
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);
  
  
  useEffect(() => {
  const unlisten = listen<Packet>("packet-received", (event) => {
    const packet = event.payload;

    if ("system" in packet) {
      setStatus(packet.system.message);
    }

    if ("roomCreated" in packet) {
      setActiveRoomId(packet.roomCreated.room_id);
      setStatus(`Room created: ${packet.roomCreated.room_id}`);
    }

    if ("roomSync" in packet) {
      const { room_id, room_name, users: syncUsers } = packet.roomSync;
      
      const newUsers = syncUsers.map((u) => ({
        id: u.id,
        username: u.username,
      }));

      const currentActiveId = activeRoomIdRef.current;
      const currentIdToJoin = roomIdToJoinRef.current;

      if (
        currentActiveId === room_id || 
        currentIdToJoin === room_name || 
        currentIdToJoin === room_id
      ) {
        setActiveRoomId(room_id);
        setActiveRoomName(room_name);
        setRoomUsers(newUsers);
        setRoomIdToJoin("");
      }
    }

    if ("roomLeave" in packet) {
      setActiveRoomId(null);
      setActiveRoomName(null);
    }

    if ("userList" in packet) {
      const newGlobalUsers = packet.userList.users.map(([id, username]) => ({
          id,
          username,
      }));

      setGlobalUsers(newGlobalUsers);

    }

    if ("message" in packet) {
      const msg = packet.message;

      const chatKey = msg.room_id 
        ? `room_${msg.room_id}` 
        : msg.from_id;
      
      setDialogs((prev) => {
        const currentMsgs = prev[chatKey] || [];

        if (msg.from_username === "Me" && currentMsgs.some(m => m.body === msg.body)) {
          return prev;
        }
        
        return {
          ...prev,
          [chatKey]: [...currentMsgs, { 
            from_username: msg.from_username, 
            body: msg.body 
          }]
        };
      });
    }
  });

  return () => {
    unlisten.then((f) => f());
  };
}, [nickname]);

  /* ================= ACTIONS ================= */
  const startHost = () => {
    setShowHostInput(true);
  };

  const formatBps = (bytes: number) => {
        if (bytes === 0) return '0 B/s';
        const k = 1024;
        const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      };

  const confirmStartHost = async () => {
    setShowHostInput(false);
    setMode("host");
    setStatus("Starting server...");

    try {

      const ticket: string | null = await invoke("start_host_mode", { 
        port: hostPort, 
        connectionType: hostConnectionType 
      });

      setStatus("Server active");
      showSuccess("Host initialized");

      if (hostConnectionType === "quic" && ticket) {
        setQuicTicket(ticket);
        setShowTicketModal(true);
      }
    } catch (e) {
      console.error(e);
      setStatus("Failed to start server");
      setMode("menu");
    }
  };

  // Main connection function
  const connectClient = async (retry = false) => {
    if (!nickname.trim()) return;

    if (!retry) setShowNickInput(false);

    if (mode === "client" && !retry) {
      console.warn("Already connected");
      return;
    }

    try {
      if (connectionType === "direct") {
        await invoke("connect_to_server", {
          ip,
          nickname,
        });
      } else if (connectionType === "quic") {
        await invoke("connect_to_iroh", {
          ticket: ip,
          nickname,
        });
      }

      setMode("client");

      setStatus("Connecting...")

      setUntrustedFp(null);
      setStatus(`Connected as ${nickname}`);
      showSuccess("Connected successfully");

    } catch (e: any) {
      const errStr = String(e);
      console.error("Connection error:", errStr);

      if (errStr.includes("UNTRUSTED_HOST|")) {

        const [_, nodeId, fingerprint] = errStr.split("|");

        showWarn(
          `Untrusted server fingerprint:\n${fingerprint}`,
          async () => {
            await invoke("confirm_host", { ip: nodeId, fingerprint });
            await connectClient(true);
          },
          () => {
            setMode("menu");
          }
        );
        return;

      } else {
         setStatus("Connection failed");
         if (!retry) setMode("menu");
      }
    }
  };

  const trustAndConnect = async () => {

    setUntrustedFp(null);
    setStatus("Retrying with trust...");
    
    await connectClient(true);
  };

  const cancelTrust = () => {
    setUntrustedFp(null);
    setMode("menu");
    setStatus("");
  };

  const sendMessage = async () => {
    if (!msgInput.trim()) return;

    try {
      if (activeRoomId) {
        await invoke("send_room_message_cmd", {
          roomId: activeRoomId,
          message: msgInput,
        });
      } else if (activeUserId) {
        await invoke("send_packet", {
        packet: {
          route: {
            to: activeUserId,
            body: msgInput,
          },
        },
      });
      setDialogs(prev => ({
        ...prev,
        [activeUserId]: [...(prev[activeUserId] || []), { from_username: "Me", body: msgInput }]
      }));
      }
      setMsgInput("");
    } catch (e) {
      console.error("Failed to send message:", e);
    }
    };
  /* ================= UI ================= */

  return (

    <div className="relative min-h-screen flex items-center justify-center bg-dungeon text-snape-silver overflow-hidden">

      {/* FOG */}
      <div className="absolute inset-0 fog-bg" />

      {/* SUCCESS TOAST */}
      {successMessage && (
        <div className="fixed top-6 z-80 px-6 py-3 rounded-xl
          bg-slytherin border border-potion-glow
          text-potion-glow text-xs uppercase tracking-widest
          shadow-[0_0_20px_rgba(74,222,128,0.35)]
          animate-in fade-in slide-in-from-top-2 duration-500
        ">
          {successMessage}
        </div>
      )}

      {/* WARN TOAST */}
      {warnToast && (
        <div
          className="fixed top-16 z-50 px-6 py-4 rounded-xl
          bg-red-900/40 border border-red-500
          text-red-300 text-xs uppercase tracking-widest
          shadow-[0_0_25px_rgba(220,38,38,0.4)]
          animate-in fade-in slide-in-from-top-2 duration-300"
        >
          <div className="mb-3 wrap-break-words">
            {warnToast.message}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                warnToast.onCancel?.();
                setWarnToast(null);
              }}
              className="flex-1 border border-red-500/40 rounded py-2
                hover:bg-red-500/10 transition text-xs"
            >
              Don’t trust
            </button>

            <button
              onClick={() => {
                warnToast.onTrust?.();
                setWarnToast(null);
              }}
              className="flex-1 bg-red-500 text-black rounded py-2
                hover:bg-red-400 transition text-xs font-semibold"
            >
              Trust
            </button>
          </div>
        </div>
      )}

      {/* === SECURITY ALERT (NEW UNTRUSTED FP) === */}
      {untrustedFp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
           <div className="bg-dungeon-surface border border-red-500/30 p-8 rounded-xl w-full max-w-md text-center shadow-[0_0_50px_rgba(220,38,38,0.1)]">
            <h2 className="font-serif text-xl text-red-400 mb-2 uppercase tracking-widest">
              Security Warning
            </h2>
            <p className="text-xs text-gray-400 mb-6 uppercase tracking-wider">
               The server identity cannot be verified.
            </p>

            <div className="bg-black/50 border border-red-900/30 p-4 rounded mb-8 overflow-hidden break-all">
                <p className="text-[10px] text-gray-500 mb-2">FINGERPRINT / ERROR:</p>
                <code className="font-mono text-xs text-red-300">
                    {untrustedFp}
                </code>
            </div>

            <div className="flex gap-4">
              <button
                onClick={cancelTrust}
                className="flex-1 border border-white/10 text-xs text-gray-400 hover:text-white hover:border-white/30 ease-in-out duration-150 transition-all rounded py-3 uppercase tracking-wider"
              >
                Abort
              </button>
              <button
                onClick={trustAndConnect}
                className="flex-1 bg-red-900/20 border border-red-500/50 text-red-400 rounded py-3 text-xs uppercase tracking-wider hover:bg-red-500 hover:text-black ease-in-out duration-200 transition-all shadow-[0_0_15px_rgba(220,38,38,0.2)]"
              >
                Trust {ip}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === HOST SETTINGS MODAL === */}
      {showHostInput && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-dungeon-surface border border-slytherin p-8 rounded-xl w-full max-w-sm text-center">
            <h2 className="font-serif text-xl text-potion-glow mb-6 uppercase tracking-widest">
              Host Settings
            </h2>

            {/* Host's switcher Direct/Quic */}
            <div className="flex bg-black/40 p-1 rounded-lg mb-6 border border-white/5">
              <button
                onClick={() => setHostConnectionType('direct')}
                className={`flex-1 py-2 text-[10px] uppercase tracking-widest transition-all rounded-md ${
                  hostConnectionType === 'direct' 
                  ? 'bg-slytherin/60 text-potion-glow shadow-[0_0_10px_rgba(74,222,128,0.2)]' 
                  : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Direct
              </button>
              <button
                onClick={() => setHostConnectionType('quic')}
                className={`flex-1 py-2 text-[10px] uppercase tracking-widest transition-all rounded-md ${
                  hostConnectionType === 'quic' 
                  ? 'bg-slytherin/60 text-potion-glow shadow-[0_0_10px_rgba(74,222,128,0.2)]' 
                  : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Quic (Magic)
              </button>
            </div>
            
            {/* IP's enter field */}
            <input
              autoFocus
              value={hostPort}
              onChange={(e) => setHostPort(e.target.value)}
              placeholder="Port (e.g. 5173)"
              className="w-full bg-black/40 border border-white/10 rounded-lg p-3 mb-6 outline-none text-xs text-center font-mono"
            />

            <div className="flex gap-4">
              <button
                onClick={() => setShowHostInput(false)}
                className="flex-1 border text-xs text-red-400 hover:text-red-500 ease-in-out duration-150 transition-colors rounded py-2"
              >
                Cancel
              </button>
              <button
                onClick={confirmStartHost}
                className="flex-1 border text-green-400 rounded py-2 text-xs hover:text-green-500 ease-in-out duration-150 transition-colors"
              >
                Start Host
              </button>
            </div>
          </div>
        </div>
      )}

      {/*  QUIC TICKET MODAL  */}
      {quicTicket && showTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-dungeon-surface border border-slytherin p-8 rounded-xl w-full max-w-md text-center shadow-[0_0_50px_rgba(74,222,128,0.1)]">
            <h2 className="font-serif text-xl text-potion-glow mb-4 uppercase tracking-widest">
              QUIC Ticket
            </h2>

            <div className="bg-black/50 border border-slytherin p-4 rounded mb-6 overflow-x-auto break-all text-xs font-mono text-green-300">
              {quicTicket}
            </div>

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(quicTicket);
                  showSuccess("Ticket copied!");
                }}
                className="flex-1 bg-slytherin/60 text-black rounded py-2 text-xs uppercase tracking-widest hover:bg-green-500 transition"
              >
                Copy Ticket
              </button>

              <button
                onClick={() => setShowTicketModal(false)}
                className="flex-1 border border-slytherin text-xs text-green-400 rounded py-2 uppercase tracking-widest hover:bg-black/30 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      

      {/* NICK & IP INPUT */}
      {showNickInput && !untrustedFp && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-dungeon-surface border border-slytherin p-8 rounded-xl w-full max-w-sm text-center">
            <h2 className="font-serif text-xl text-potion-glow mb-6 uppercase tracking-widest">
              Identify Yourself
            </h2>

            {/* Cliemt's switcher Direct/Quic */}
            <div className="flex bg-black/40 p-1 rounded-lg mb-2 border border-white/5">
              <button
                onClick={() => setConnectionType('direct')}
                className={`flex-1 py-2 text-[10px] uppercase tracking-widest transition-all rounded-md ${
                  connectionType === 'direct' 
                  ? 'bg-slytherin/60 text-potion-glow shadow-[0_0_10px_rgba(74,222,128,0.2)]' 
                  : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Direct
              </button>
              <button
                onClick={() => setConnectionType('quic')}
                className={`flex-1 py-2 text-[10px] uppercase tracking-widest transition-all rounded-md ${
                  connectionType === 'quic' 
                  ? 'bg-slytherin/60 text-potion-glow shadow-[0_0_10px_rgba(74,222,128,0.2)]' 
                  : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                Quic
              </button>
            </div>
            
            {/* Input field (IP) */}
            <input
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder={connectionType === 'direct' ? "Server IP (e.g. 192.168.1.5)" : "Enter Quic Ticket..."}
              className="w-full bg-black/40 border border-white/10 rounded-lg p-3 mb-4 outline-none text-xs text-center font-mono placeholder:font-sans focus:border-potion-glow/50 transition-colors"
            />

            {/* Input field (Nickname) */}
            <input
              autoFocus
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && connectClient()}
              placeholder="Enter nickname..."
              className="w-full bg-black/40 border border-white/10 rounded-lg p-3 mb-6 outline-none text-xs text-center focus:border-potion-glow/50 transition-colors"
            />

            {/* Buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => setShowNickInput(false)}
                className="flex-1 border border-white/10 text-xs text-red-400 hover:text-red-500 hover:border-red-500/30 ease-in-out duration-150 transition-all rounded py-2 "
              >
                Cancel
              </button>
              <button
                onClick={() => connectClient()}
                className="flex-1 border border-slytherin/50 text-green-400 rounded py-2 text-xs hover:bg-slytherin/10 hover:text-green-300 hover:border-slytherin ease-in-out duration-150 transition-all shadow-[0_0_15px_rgba(74,222,128,0.1)] hover:shadow-[0_0_20px_rgba(74,222,128,0.25)]"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MENU INTERFACE */}
      {mode === "menu" && (
        <div className="relative z-10 w-full max-w-md bg-dungeon-surface/70 backdrop-blur border border-white/10 rounded-xl p-8 shadow-2xl">
          
          {/* Header */}
          <div className="text-center mb-10 border-b border-white/5 pb-6">
            <h1 className="text-3xl font-serif tracking-[0.25em] uppercase">
              Severus
            </h1>
            <p className="text-[10px] text-potion-glow/60 mt-2 uppercase tracking-widest">
              {status || "Awaiting connection"}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-6">
            <button
              onClick={startHost}
              className="h-14 border border-slytherin text-xs uppercase tracking-[0.2em] rounded transition-all duration-300 ease-in-out hover:bg-green-500/10 hover:shadow-[0_0_20px_rgba(74,222,128,0.1)]"
            >
              Initialize Host
            </button>
            
            <button
              onClick={() => setShowNickInput(true)}
              className="h-14 border border-white/20 text-xs uppercase tracking-[0.2em] rounded transition-all duration-300 ease-in-out hover:bg-white/5 hover:border-white"
            >
              Connect Client
            </button>
          </div>

          {/* Footer Decoration */}
          <div className="mt-8 flex justify-center gap-1">
            <div className="w-1 h-1 bg-slytherin/30 rounded-full" />
            <div className="w-1 h-1 bg-slytherin/50 rounded-full" />
            <div className="w-1 h-1 bg-slytherin/30 rounded-full" />
          </div>
        </div>
      )}

    {mode === "host" && (
          <div className="flex w-full h-screen gap-4 ">
            
            {/* Left column */}
            <div className="flex flex-col w-1/6 gap-4">
              
              {/* Upper square */}
              <div className="flex-1 bg-gray-900/50 border border-white/5 rounded-none backdrop-blur-sm" />
              
              {/* Badge for QUIC */}
              {hostConnectionType === 'quic' && quicTicket && (
                <div className=" mt-2 border-t border-white/10 pt-2 flex flex-col items-center">
                  <div className="text-[12px] text-gray-500 uppercase tracking-widest mb-5">
                    Quic Ticket
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(quicTicket);
                      showSuccess("Ticket copied!");
                    }}
                    className="group flex items-center justify-center gap-2 text-[14px] font-mono text-potion-glow hover:text-green-300 transition-colors cursor-pointer text-left"
                    title="Click to copy ticket"
                  >
                    <span className="truncate max-w-120px opacity-80 group-hover:opacity-100 border-b border-dashed border-white/20 pb-0.5">
                      {quicTicket.slice(0, 16)}...
                    </span>
                    <svg className="w-3 h-3 opacity-50 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                  </button>
                </div>
              )}

              {/* Control Panel */}
              <div className="h-35 bg-black/80 border border-slytherin rounded-none p-4 flex flex-col justify-between shadow-[0_0_20px_rgba(74,222,128,0.05)]">
                
                {/* Monitoring Toggle */}
                <div className="flex flex-col items-start gap-1">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">
                    Monitoring
                  </span>
                  <button
                    onClick={handleToggleMonitoring}
                    className={`w-9 h-5 rounded-full relative border border-white/10 transition-all duration-300 ${
                      monitoring ? "bg-slytherin/60" : "bg-white/5"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 ri-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform duration-300 ${
                        monitoring ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Severus & Active */}
                <div className="flex flex-col gap-2">
                  <h2 className="font-serif text-potion-glow text-lg uppercase tracking-widest leading-none">
                    Severus
                  </h2>
                  
                  <div className="border border-slytherin/30 bg-slytherin/10 px-2 py-1 rounded-none flex items-center gap-2 w-max">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_#22c55e]" />
                    <span className="text-green-400 font-mono text-[10px] uppercase tracking-widest font-bold">
                      Active
                    </span>
                  </div>
                </div>

              </div>
            </div>

            {/* Right column */}
            <div className="flex-1 bg-gray-800/40 border border-white/5 rounded-none p-4 font-mono text-xs text-gray-500 overflow-hidden relative backdrop-blur-sm">
              <div className="absolute inset-0 bg-gray-800/40 opacity-10 pointer-events-none mix-blend-overlay"></div>
              
              <div className="space-y-1 opacity-60">
                {monitoring && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="metrics-panel">
                      <div className="text-potion-glow mb-2">
                        Active Connections: <span className="text-white">{activeConnections}</span>
                      </div>
                      <div>Upload: {formatBps(speed.upload)}</div>
                      <div>Download: {formatBps(speed.download)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

      {/* CLIENT CHAT INTERFACE */}
      {mode === "client" && !untrustedFp && (
        <div className="relative z-10 w-full h-screen flex flex-col gap-6 px-6">

          {/* Bord Severus */}
          <div className="w-full text-right mb-2">
            <span className="text-2xl font-serif tracking-[0.25em] uppercase">
              Severus 
            </span>
            <span className={ping > 150 ? "text-red-500" : "text-potion-glow"}>
                {ping}ms
            </span>
            <div
              className={`text-[10px] uppercase tracking-widest -mt-1
                ${
                  connectionState === "ok"
                    ? "text-green-500"
                    : connectionState === "bad"
                    ? "text-red-500 animate-pulse"
                    : "text-gray-500"
                }
              `}
            >
              {connectionState === "ok" && `Connected to ${ip.length > 21 ? ip.slice(0, 21) + "..." : ip}`}
              {connectionState === "bad" && `Connection unstable`}
              {connectionState === "offline" && `Disconnected`}
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="flex flex-col gap-2">
              <input 
                className="bg-black/40 border border-white/10 rounded px-3 py-1 text-xs outline-none focus:border-potion-glow/50"
                value={roomName} 
                onChange={e => setRoomName(e.target.value)} 
                placeholder="Room's name" 
              />
              <button className="text-[10px] uppercase tracking-tighter text-left hover:text-potion-glow" onClick={handleCreate}>[ Create room ]</button>
            </div>
            
            <div className="flex flex-col gap-2">
              <input 
                className="bg-black/40 border border-white/10 rounded px-3 py-1 text-xs outline-none focus:border-potion-glow/50"
                value={roomIdToJoin} 
                onChange={e => setRoomIdToJoin(e.target.value)} 
                placeholder="Room's ID/Name" 
              />
              <button className="text-[10px] uppercase tracking-tighter text-left hover:text-potion-glow" onClick={handleJoin}>[ Join room ]</button>
            </div>
          </div>

          <div className="flex flex-1 gap-4 flex-row overflow-hidden pb-6">
            {/* USERS / ROOM MEMBERS */}
            <div className="w-72 h-full border border-white/10 rounded-l-lg bg-dungeon-surface/60 backdrop-blur overflow-y-auto shrink-0 p-2">
              <div className="text-[10px] text-gray-500 uppercase mb-4 px-2 tracking-widest">
                {activeRoomId ? "Room Members" : "Online Users"}
              </div>
              {(activeRoomId ? roomUsers : globalUsers).map((u: User) => (
                <div
                  key={u.id}
                  onClick={() => {
                    setActiveUserId(u.id);
                    setActiveRoomId(null);
                  }}
                  className={`text-xs font-mono p-2 mb-1 rounded cursor-pointer transition-colors
                    ${
                      activeUserId === u.id
                        ? "bg-slytherin/40 text-potion-glow"
                        : "hover:bg-white/5"
                    }
                  `}
                >
                  {u.username}
                </div>
              ))}
            </div>

            {/* CHAT */}
            <div className="flex-1 min-w-0 h-full flex flex-col border border-white/10 rounded-r-lg p-4 bg-dungeon-surface/60 backdrop-blur overflow-hidden">
              
              {/* Chat Header */}
              <div className="mb-4 px-4 py-2 border-b border-white/5 flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-[0.3em] text-gray-400 flex items-center gap-2">
                  {activeRoomId ? (
                    <>
                      Location: Room <span className="text-white">{activeRoomName || "..."}</span> [
                      <div className="relative flex flex-col items-center">
                        {copied && (
                          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-green-500 lowercase">
                            Copied!
                          </span>
                        )}

                        <button
                          onClick={() => handleCopy(activeRoomId)}
                          className="text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer active:scale-95"
                          title="Click to copy"
                        >
                          {activeRoomId.slice(0, 8)}...
                        </button>
                      </div>
                      ]
                    </>
                  ) : activeUserId ? (
                    `Whisper: ${globalUsers.find((u: User) => u.id === activeUserId)?.username}`
                  ) : (
                    "Select Target"
                  )}
                </span>
                
                {activeRoomId && (
                  <button 
                    onClick={handleLeave}
                    className="text-[9px] text-red-900 hover:text-red-500 uppercase cursor-pointer"
                  >
                    Leave Room
                  </button>
                )}
              </div>

              {!activeUserId && !activeRoomId ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-base text-gray-500 uppercase tracking-widest animate-pulse">
                    Waiting for selection...
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto p-6 flex flex-col justify-end">
                    <div className="space-y-2 mt-auto">
                      {(dialogs[activeRoomId ? `room_${activeRoomId}` : activeUserId!] || []).map((m, i) => (
                        <div key={i} className="text-base font-mono leading-relaxed">
                          <span className="text-potion-glow opacity-80">
                            [{m.from_username}]
                          </span>{" "}
                          <span className="text-gray-200">{m.body}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3 mt-4">
                    <input
                      value={msgInput}
                      onChange={(e) => setMsgInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                      placeholder={activeRoomId ? "Message room..." : "Whisper..."}
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-base outline-none focus:border-potion-glow/30 transition-all font-mono"
                    />
                    <button
                      onClick={sendMessage}
                      className="text-potion-glow text-xs uppercase tracking-widest cursor-pointer hover:brightness-125 transition-all px-4"
                    >
                      Send
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}