import { useCallback, useEffect, useRef, useState } from "react";

export function useClipboard(resetMs = 2000) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), resetMs);
        return true;
      } catch (err) {
        console.error("Copy error:", err);
        return false;
      }
    },
    [resetMs]
  );

  return { copied, copy };
}