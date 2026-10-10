"use client";

import React, { createContext, useContext, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

interface ToastContextType {
  showToast: (message: any, type?: "success" | "error" | "info") => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: any, type: "success" | "error" | "info" = "info") => {
    let text = "Notification";
    if (typeof message === "string") {
      text = message;
    } else if (message instanceof Error) {
      text = message.message;
    } else if (message && typeof message === "object") {
      text = message.message || message.msg || message.detail || JSON.stringify(message);
    } else if (message != null) {
      text = String(message);
    }
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message: text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-xl border shadow-lg bg-white animate-in slide-in-from-bottom-3 duration-150 ${
              t.type === "success"
                ? "border-emerald-200 text-slate-800"
                : t.type === "error"
                ? "border-red-200 text-slate-800"
                : "border-blue-200 text-slate-800"
            }`}
          >
            <div className="flex items-center gap-3">
              {t.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
              {t.type === "error" && <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />}
              {t.type === "info" && <Info className="w-5 h-5 text-blue-600 shrink-0" />}
              <span className="text-xs font-semibold text-slate-800">{t.message}</span>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-slate-400 hover:text-slate-700 p-1 ml-2"
              aria-label="Dismiss toast"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
