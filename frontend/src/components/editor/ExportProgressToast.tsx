// src/components/editor/ExportProgressToast.tsx
import { motion, AnimatePresence } from 'framer-motion';

interface ExportProgressToastProps {
  exportStatus: 'idle' | 'rendering' | 'uploading' | 'completed';
  exportProgress: number;
  exportFormat: string;
}

export default function ExportProgressToast({ exportStatus, exportProgress, exportFormat }: ExportProgressToastProps) {
  return (
    <AnimatePresence>
      {exportStatus !== 'idle' && (
        <motion.div
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 100, opacity: 0 }}
          className="fixed bottom-6 right-6 w-80 bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.15)] border border-slate-200 p-5 z-[9999]"
        >
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-black text-slate-800 uppercase italic">
              {exportStatus === 'rendering' ? '🚀 Rendering...' : exportStatus === 'uploading' ? '☁️ Processing...' : '✨ Completed!'}
            </span>
            <span className="text-xs font-black text-indigo-600">{exportProgress}%</span>
          </div>

          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-50">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${exportProgress}%` }}
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
            />
          </div>

          <p className="mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
            Your {exportFormat.toUpperCase()} is almost ready
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
