import { useLayoutEffect, useRef } from "react";
import { MAX_MESSAGE_LENGTH } from "../../utils/limits";

interface Props {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSend: () => void;
}

const MAX_HEIGHT = 160;
const COUNTER_FROM = Math.floor(MAX_MESSAGE_LENGTH * 0.8);

export function MessageInput({ value, placeholder, onChange, onSend }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.height = "auto";
    const borders = el.offsetHeight - el.clientHeight;
    const full = el.scrollHeight + borders;

    el.style.height = Math.min(full, MAX_HEIGHT) + "px";
    el.style.overflowY = full > MAX_HEIGHT ? "auto" : "hidden";
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  };

  const atLimit = value.length >= MAX_MESSAGE_LENGTH;

  return (
    <div className="flex gap-3 mt-4 items-end">
      <div className="relative flex-1">
        {value.length >= COUNTER_FROM && (
          <span
            className={`absolute -top-4 right-1 text-[10px] font-mono ${
              atLimit ? "text-red-500" : "text-gray-500"
            }`}
          >
            {value.length}/{MAX_MESSAGE_LENGTH}
          </span>
        )}
        <textarea
          ref={ref}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full resize-none bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-base outline-none focus:border-potion-glow/30 transition-all font-mono"
        />
      </div>
      <button
        onClick={onSend}
        className="text-potion-glow text-xs uppercase tracking-widest cursor-pointer hover:brightness-125 transition-all px-4 py-3"
      >
        Send
      </button>
    </div>
  );
}