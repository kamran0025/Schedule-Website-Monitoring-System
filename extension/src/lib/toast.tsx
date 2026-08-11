import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastVariant = "success" | "error";

interface ToastMessage {
  id: number;
  text: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  success: (text: string) => void;
  error: (text: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 3000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);

  const push = useCallback((text: string, variant: ToastVariant) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, text, variant }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const value: ToastContextValue = {
    success: (text) => push(text, "success"),
    error: (text) => push(text, "error"),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-2 z-50 flex flex-col items-center gap-1.5 px-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto max-w-full truncate rounded px-3 py-1.5 text-xs font-medium text-white shadow-lg ${
              toast.variant === "success" ? "bg-slate-900 dark:bg-slate-700" : "bg-red-600"
            }`}
          >
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
