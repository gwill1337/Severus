import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unlisten = listen<T>(event, (e) => handlerRef.current(e.payload));
    return () => { unlisten.then((f) => f()); };
  }, [event]);
}