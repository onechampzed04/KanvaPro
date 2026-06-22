import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showWarning: (message: string) => void;
  showInfo: (message: string) => void;
}

// ── Context ────────────────────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={16} />,
  error:   <XCircle size={16} />,
  warning: <AlertTriangle size={16} />,
  info:    <Info size={16} />,
};

const STYLES: Record<ToastType, { bar: string; icon: string; bg: string }> = {
  success: {
    bar:  'bg-emerald-500',
    icon: 'text-emerald-400',
    bg:   'border-emerald-500/20',
  },
  error: {
    bar:  'bg-rose-500',
    icon: 'text-rose-400',
    bg:   'border-rose-500/20',
  },
  warning: {
    bar:  'bg-amber-500',
    icon: 'text-amber-400',
    bg:   'border-amber-500/20',
  },
  info: {
    bar:  'bg-blue-500',
    icon: 'text-blue-400',
    bg:   'border-blue-500/20',
  },
};

// ── Provider ───────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timerMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    if (timerMap.current.has(id)) {
      clearTimeout(timerMap.current.get(id)!);
      timerMap.current.delete(id);
    }
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);

    const duration = type === 'error' ? 6000 : 4000;
    const timer = setTimeout(() => dismiss(id), duration);
    timerMap.current.set(id, timer);
  }, [dismiss]);

  const showSuccess = useCallback((m: string) => showToast(m, 'success'), [showToast]);
  const showError   = useCallback((m: string) => showToast(m, 'error'),   [showToast]);
  const showWarning = useCallback((m: string) => showToast(m, 'warning'), [showToast]);
  const showInfo    = useCallback((m: string) => showToast(m, 'info'),    [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning, showInfo }}>
      {children}

      {/* Toast Container — fixed top-right */}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence initial={false}>
          {toasts.map(toast => {
            const s = STYLES[toast.type];
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: 60, scale: 0.92 }}
                animate={{ opacity: 1, x: 0,  scale: 1 }}
                exit={{   opacity: 0, x: 60,  scale: 0.92 }}
                transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                className={`pointer-events-auto flex items-start gap-3 min-w-[280px] max-w-[360px] bg-slate-900/95 backdrop-blur-md border ${s.bg} border rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden`}
                style={{ borderLeftWidth: 0 }}
              >
                {/* Left accent bar */}
                <div className={`w-1 self-stretch shrink-0 ${s.bar}`} />

                {/* Icon */}
                <span className={`mt-3 shrink-0 ${s.icon}`}>
                  {ICONS[toast.type]}
                </span>

                {/* Message */}
                <p className="flex-1 text-sm text-white/90 font-medium py-3 pr-1 leading-snug">
                  {toast.message}
                </p>

                {/* Close button */}
                <button
                  onClick={() => dismiss(toast.id)}
                  className="mt-2.5 mr-2 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition shrink-0"
                >
                  <X size={13} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
