interface Props {
  checked: boolean;
  onChange: () => void;
}

export function ToggleSwitch({ checked, onChange }: Props) {
  return (
    <button
      onClick={onChange}
      className={`w-9 h-5 rounded-full relative border border-white/10 transition-all duration-300 ${
        checked ? "bg-slytherin/60" : "bg-white/5"
      }`}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform duration-300 ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}