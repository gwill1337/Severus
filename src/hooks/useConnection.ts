import { useState } from "react";
import type { useToast } from "./useToast";
import type { Mode } from "../types/Connection";
import { invoke } from "@tauri-apps/api/core";

export function useConnection(toast: Pick<ReturnType<typeof useToast>, "showSuccess" | "showWarn">) {
    const [mode, setMode] = useState<Mode>("menu");
    const [status, setStatus] = useState("");
    const [ip, setIp] = useState("127.0.0.1");
    const [nickname, setNickname] = useState("");
    const [connectionType, setConnectionType] = useState<'direct' | 'quic'>('direct');
    const [hostPort, setHostPort] = useState("");
    const [hostConnectionType, setHostConnectionType] = useState<'direct' | 'quic'>('direct');
    const [quicTicket, setQuicTicket] = useState<string | null>(null);

    const [showHostInput, setShowHostInput] = useState(false);
    const [showNickInput, setShowNickInput] = useState(false);
    const [showTicketModal, setShowTicketModal] = useState(false);
    const [safetyNumbers, setSafetyNumbers] = useState<Record<string, string>>({});



    const startHost = () => {
        setShowHostInput(true);
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
            toast.showSuccess("Host initialized");

            if (hostConnectionType === "quic" && ticket) {
                setQuicTicket(ticket);
                setShowTicketModal(true);
            }
        } catch (e) {
            console.error(e);
            setStatus("Failed to start server");
            setMode("menu");
            setSafetyNumbers({});
        }
    };


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

            setStatus(`Connected as ${nickname}`);
            toast.showSuccess("Connected successfully");

        } catch (e: any) {
            const errStr = String(e);
            console.error("Connection error:", errStr);

            if (errStr.includes("UNTRUSTED_HOST|")) {

                const [_, nodeId, fingerprint] = errStr.split("|");

                toast.showWarn({
                    message: `Untrusted server fingerprint:\n${fingerprint}`,
                    onTrust: async () => {
                        await invoke("confirm_host", { ip: nodeId, fingerprint });
                        await connectClient(true);
                    },
                    onCancel: () => {
                        setMode("menu");
                    }
                });
                return;

            } else {
                setStatus("Connection failed");
                if (!retry) setMode("menu");
            }
        }
    };

    const trustAndConnect = async () => {

        setStatus("Retrying with trust...");

        await connectClient(true);
    };

    const cancelTrust = () => {
        setMode("menu");
        setStatus("");
    };


    return {
        mode, status,
        ip, setIp, nickname, setNickname,
        connectionType, setConnectionType,
        showNickInput, setShowNickInput,
        connectClient,
        hostPort, setHostPort,
        hostConnectionType, setHostConnectionType,
        showHostInput, setShowHostInput,
        quicTicket, showTicketModal, setShowTicketModal,
        confirmStartHost, safetyNumbers, startHost,
        trustAndConnect, cancelTrust
    };
}