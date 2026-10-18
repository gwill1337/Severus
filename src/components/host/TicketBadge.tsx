interface Props {
  ticket: string;
  onCopy: () => void;
}

export function TicketBadge({ ticket, onCopy }: Props) {
  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(ticket);
      onCopy();
    } catch (err) {
      console.error("Copy error:", err);
    }
  };

  return (
    <div className="mt-2 border-t border-white/10 pt-2 flex flex-col items-center">
      <div className="text-[12px] text-gray-500 uppercase tracking-widest mb-5">Quic Ticket</div>
      <button
        onClick={handleClick}
        className="group flex items-center justify-center gap-2 text-[14px] font-mono text-potion-glow hover:text-green-300 transition-colors cursor-pointer text-left"
        title="Click to copy ticket"
      >
        <span className="truncate max-w-[120px] opacity-80 group-hover:opacity-100 border-b border-dashed border-white/20 pb-0.5">
          {ticket.slice(0, 16)}...
        </span>
        <svg
          className="w-3 h-3 opacity-50 group-hover:opacity-100"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </button>
    </div>
  );
}