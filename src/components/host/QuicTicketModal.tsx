// components/host/QuicTicketModal.tsx
interface Props {
  ticket: string;
  onCopy: () => void;
  onClose: () => void;
}

export function QuicTicketModal({ ticket, onCopy, onClose }: Props) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(ticket);
      onCopy();
    } catch (err) {
      console.error("Copy error:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-dungeon-surface border border-slytherin p-8 rounded-xl w-full max-w-md text-center shadow-[0_0_50px_rgba(74,222,128,0.1)]">
        <h2 className="font-serif text-xl text-potion-glow mb-4 uppercase tracking-widest">
          QUIC Ticket
        </h2>

        <div className="bg-black/50 border border-slytherin p-4 rounded mb-6 overflow-x-auto break-all text-xs font-mono text-green-300">
          {ticket}
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={handleCopy}
            className="flex-1 bg-slytherin/60 text-black rounded py-2 text-xs uppercase tracking-widest hover:bg-green-500 transition"
          >
            Copy Ticket
          </button>

          <button
            onClick={onClose}
            className="flex-1 border border-slytherin text-xs text-green-400 rounded py-2 uppercase tracking-widest hover:bg-black/30 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}