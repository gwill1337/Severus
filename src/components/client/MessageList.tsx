import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../types/Chat";
import { MessageBody } from "./MessageBody";

export function MessageList({ messages }: { messages: ChatMessage[] }) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length]);

    return (
        <div className="flex-1 overflow-y-auto p-6 flex flex-col justify-end">
            <div className="space-y-2 mt-auto">
                {messages.map((m, i) => (
                    <div key={i} className="text-base font-mono leading-relaxed whitespace-pre-wrap break-words">
                        <span className="text-potion-glow opacity-80">[{m.from_username}]</span>{" "}
                        <MessageBody body={m.body} />
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}