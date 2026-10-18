interface Props {
  status: string;
  onHost: () => void;
  onConnect: () => void;
}

export function MenuScreen({ status, onHost, onConnect }: Props) {
  return (
    <div className="relative z-10 w-full max-w-md bg-dungeon-surface/70 backdrop-blur border border-white/10 rounded-xl p-8 shadow-2xl">
      {/* Header */}
      <div className="text-center mb-10 border-b border-white/5 pb-6">
        <h1 className="text-3xl font-serif tracking-[0.25em] uppercase">Severus</h1>
        <p className="text-[10px] text-potion-glow/60 mt-2 uppercase tracking-widest">
          {status || "Awaiting connection"}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-6">
        <button
          onClick={onHost}
          className="h-14 border border-slytherin text-xs uppercase tracking-[0.2em] rounded transition-all duration-300 ease-in-out hover:bg-green-500/10 hover:shadow-[0_0_20px_rgba(74,222,128,0.1)]"
        >
          Initialize Host
        </button>

        <button
          onClick={onConnect}
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
  );
}