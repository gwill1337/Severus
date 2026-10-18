import { useState, useRef, useCallback } from "react";

export interface WarnToast {
    message: string;
    onTrust?: () => void;
    onCancel?: () => void;
}

export function useToast() {
    const [success, setSuccess] = useState<string | null>(null);
    const [warn, setWarn] = useState<WarnToast | null>(null);
    const successTimer = useRef<number | undefined>(undefined);
    const warnTimer = useRef<number| undefined>(undefined);

    const showSuccess = useCallback((message: string) => {
        clearTimeout(successTimer.current);
        setSuccess(message);
        successTimer.current = window.setTimeout(() => setSuccess(null), 2500);
    }, []);

    const showWarn = useCallback((toast: WarnToast) => {
        clearTimeout(warnTimer.current);
        setWarn(toast);
        // warnTimer.current = window.setTimeout(() => setWarn(null), 5000);
    }, []);

    const dismissWarn = useCallback(() => setWarn(null), []);

    return { success, warn, showSuccess, showWarn, dismissWarn };
}