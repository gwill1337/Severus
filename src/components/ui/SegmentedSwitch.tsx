interface Props<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

export function SegmentedSwitch<T extends string>({ value, options, onChange }: Props<T>) {
  return (
    <div className="flex bg-black/40 p-1 rounded-lg mb-2 border border-white/5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 py-2 text-[10px] uppercase tracking-widest transition-all rounded-md ${
            value === o.value
              ? "bg-slytherin/60 text-potion-glow shadow-[0_0_10px_rgba(74,222,128,0.2)]"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}