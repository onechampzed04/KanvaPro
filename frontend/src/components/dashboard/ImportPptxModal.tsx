/**
 * ImportPptxModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal hiển thị tiến trình import file PPTX vào KanvaPro.
 * Cho phép kéo-thả hoặc click để chọn file.
 */

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FileSliders, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface ImportPptxModalProps {
  onClose: () => void;
  onSuccess: (designId: string) => void;
}

type Status = 'idle' | 'uploading' | 'parsing' | 'done' | 'error';

export default function ImportPptxModal({ onClose, onSuccess }: ImportPptxModalProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [slideCount, setSlideCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    // Client-side extension check
    if (!file.name.toLowerCase().endsWith('.pptx')) {
      setErrorMsg('Chỉ hỗ trợ file .pptx. Định dạng .ppt và .pptm không được chấp nhận.');
      setStatus('error');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setErrorMsg('File vượt quá giới hạn 100 MB.');
      setStatus('error');
      return;
    }

    setStatus('uploading');
    setProgress(10);
    setErrorMsg('');

    const formData = new FormData();
    formData.append('pptx', file);

    // Simulate progress steps
    const progInterval = setInterval(() => {
      setProgress(p => Math.min(p + 8, 85));
    }, 600);

    try {
      setStatus('parsing');
      const token = localStorage.getItem('token');
      const workspaceId = localStorage.getItem('kanva_current_workspace_id');
      
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

      const res = await fetch('/api/designs/import/pptx', {
        method: 'POST',
        headers,
        body: formData,
      });

      clearInterval(progInterval);
      setProgress(95);

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Import thất bại.');
      }

      setSlideCount(data.slideCount ?? 0);
      setProgress(100);
      setStatus('done');

      // Auto-navigate after 1.5s
      setTimeout(() => onSuccess(data.designId), 1500);
    } catch (err: any) {
      clearInterval(progInterval);
      setErrorMsg(err.message || 'Lỗi không xác định.');
      setStatus('error');
    }
  }, [onSuccess]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const isProcessing = status === 'uploading' || status === 'parsing';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget && !isProcessing) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-500 to-rose-500 px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <FileSliders size={22} className="text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">Import PowerPoint</h2>
                <p className="text-white/80 text-xs">Chuyển PPTX thành Canvas KanvaPro</p>
              </div>
            </div>
            {!isProcessing && (
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/20 transition"
              >
                <X size={20} />
              </button>
            )}
          </div>

          <div className="p-6">
            {/* Idle: Drop zone */}
            {status === 'idle' && (
              <>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${isDragging
                      ? 'border-orange-400 bg-orange-50 scale-[1.01]'
                      : 'border-slate-200 hover:border-orange-300 hover:bg-orange-50/50'
                    }`}
                >
                  <Upload size={40} className={`mx-auto mb-3 transition-colors ${isDragging ? 'text-orange-500' : 'text-slate-300'}`} />
                  <p className="font-bold text-slate-700 mb-1">Kéo thả file PPTX vào đây</p>
                  <p className="text-sm text-slate-400">hoặc click để chọn file</p>
                  <p className="text-xs text-slate-300 mt-3">Chỉ hỗ trợ .pptx · Tối đa 100 MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pptx"
                    className="hidden"
                    onChange={handleInputChange}
                  />
                </div>

                {/* Security badges
                <div className="mt-4 flex flex-wrap gap-2">
                  {['Magic Bytes kiểm tra', 'Chống Zip Bomb', 'XSS Sanitize', 'Chỉ .pptx'].map(badge => (
                    <span key={badge} className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                      <CheckCircle2 size={11} />
                      {badge}
                    </span>
                  ))}
                </div> */}

                {/* What's NOT supported */}
                <p className="mt-3 text-xs text-slate-400 text-center">
                  ⚠️ Animation, transition, video, audio trong PPTX sẽ bị bỏ qua
                </p>
              </>
            )}

            {/* Processing */}
            {isProcessing && (
              <div className="py-6 text-center">
                <div className="relative w-20 h-20 mx-auto mb-4">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" strokeWidth="6" stroke="#f1f5f9" fill="none" />
                    <circle
                      cx="40" cy="40" r="34" strokeWidth="6" fill="none"
                      stroke="url(#prog)"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 34}`}
                      strokeDashoffset={`${2 * Math.PI * 34 * (1 - progress / 100)}`}
                      style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                    />
                    <defs>
                      <linearGradient id="prog" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#f97316" />
                        <stop offset="100%" stopColor="#f43f5e" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 size={24} className="text-orange-500 animate-spin" />
                  </div>
                </div>
                <p className="font-bold text-slate-700 mb-1">
                  {status === 'uploading' ? 'Đang tải lên…' : 'Đang phân tích slides…'}
                </p>
                <p className="text-sm text-slate-400">{progress}% hoàn thành</p>
                <p className="text-xs text-slate-300 mt-2">Đang trích xuất text, ảnh và tọa độ…</p>
              </div>
            )}

            {/* Done */}
            {status === 'done' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-6 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.1 }}
                  className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4"
                >
                  <CheckCircle2 size={36} className="text-emerald-500" />
                </motion.div>
                <p className="font-bold text-slate-800 text-lg mb-1">Import thành công!</p>
                <p className="text-slate-500 text-sm">
                  Đã chuyển đổi <span className="font-bold text-orange-600">{slideCount} slide</span> sang Canvas
                </p>
                <p className="text-xs text-slate-400 mt-2">Đang mở Editor…</p>
              </motion.div>
            )}

            {/* Error */}
            {status === 'error' && (
              <div className="py-4">
                <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-2xl p-4 mb-4">
                  <AlertCircle size={20} className="text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-rose-700 text-sm mb-0.5">Import thất bại</p>
                    <p className="text-rose-600 text-xs">{errorMsg}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setStatus('idle'); setProgress(0); setErrorMsg(''); }}
                  className="w-full bg-slate-900 text-white py-3 rounded-2xl font-bold text-sm hover:bg-orange-500 transition-colors"
                >
                  Thử lại
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
