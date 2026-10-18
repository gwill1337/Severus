interface ToastMessage {
    message: string;
}

export function SuccessToast({ message }: ToastMessage) {
    return (
        <div className="fixed top-6 z-80 px-6 py-3 rounded-xl bg-slytherin border border-potion-glow text-potion-glow text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(74,222,128,0.35)] animate-in fade-in slide-in-from-top-2 duration-500
        ">
            {message}
        </div>
    );
}

interface WarnToastProps {
    message: string;
    onTrust?: () => void;
    onCancel?: () => void;
    onClose: () => void;
}

export function WarnToast({ message, onTrust, onCancel, onClose }: WarnToastProps) {
    return (
        <div
            className="fixed top-16 z-50 px-6 py-4 rounded-xl
        bg-red-900/40 border border-red-500
        text-red-300 text-xs uppercase tracking-widest
        shadow-[0_0_25px_rgba(220,38,38,0.4)]
        animate-in fade-in slide-in-from-top-2 duration-300"
        >
            <div className="mb-3 wrap-break-words whitespace-pre-line">{message}</div>

            <div className="flex gap-3">
                <button
                    onClick={() => {
                        onCancel?.();
                        onClose();
                    }}
                    className="flex-1 border border-red-500/40 rounded py-2
            hover:bg-red-500/10 transition text-xs"
                >
                    Don’t trust
                </button>

                <button
                    onClick={() => {
                        onTrust?.();
                        onClose();
                    }}
                    className="flex-1 bg-red-500 text-black rounded py-2
            hover:bg-red-400 transition text-xs font-semibold"
                >
                    Trust
                </button>
            </div>
        </div>
    );
}