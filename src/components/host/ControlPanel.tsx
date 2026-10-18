import { ToggleSwitch } from "../ui/ToggleSwitch";

interface Props {
  monitoring: boolean;
  onToggleMonitoring: () => void;
}

export function ControlPanel({ monitoring, onToggleMonitoring }: Props) {
  return (
    <div className="h-35 bg-black/80 border border-slytherin rounded-none p-4 flex flex-col justify-between shadow-[0_0_20px_rgba(74,222,128,0.05)]">
      {/* Monitoring toggle */}
      <div className="flex flex-col items-start gap-1">
        <span className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">
          Monitoring
        </span>
        <ToggleSwitch checked={monitoring} onChange={onToggleMonitoring} />
      </div>

      {/* Name + status */}
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
  );
}