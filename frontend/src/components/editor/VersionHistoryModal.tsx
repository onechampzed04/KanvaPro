// src/components/editor/VersionHistoryModal.tsx
import { History, RotateCcw, Clock, CheckCircle2, Eye } from 'lucide-react';

interface VersionHistoryModalProps {
  designId: string;
  versions: any[];
  isRestoring: boolean;
  isOwner: boolean;
  onClose: () => void;
  onRestore: (versionId: string) => void;
}

export default function VersionHistoryModal({ designId, versions, isRestoring, isOwner, onClose, onRestore }: VersionHistoryModalProps) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-[9999] flex items-center justify-center backdrop-blur-md transition-all">
      <div className="bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] w-[95vw] max-w-[600px] md:max-w-[650px] overflow-hidden flex flex-col border border-white/50 relative">
        
        {/* Glow background effect */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-indigo-50/80 to-transparent pointer-events-none" />

        <div className="px-8 pt-8 pb-5 flex justify-between items-center relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
              <History size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">Version History</h2>
              <p className="text-xs font-medium text-slate-500 mt-0.5">Khôi phục các bản sao lưu thiết kế của bạn</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="px-6 pb-6 max-h-[60vh] overflow-y-auto custom-scrollbar relative z-10">
          <div className="space-y-4">
            {versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                  <Clock size={24} className="text-slate-300" />
                </div>
                <p className="text-sm font-bold text-slate-600">Chưa có phiên bản lịch sử nào</p>
                <p className="text-xs text-slate-400 mt-1">Hệ thống sẽ tự động lưu khi bạn chỉnh sửa.</p>
              </div>
            ) : (
              <div className="relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent pl-4">
                {versions.map((v, index) => {
                  return (
                    <div
                      key={v.id}
                      className="relative flex items-center mb-4 group"
                    >
                      {/* Timeline dot */}
                      <div className="absolute left-[-16px] w-8 h-8 flex items-center justify-center">
                        <div className={`w-3 h-3 rounded-full border-2 ${index === 0 ? 'bg-white border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] ring-4 ring-indigo-50' : 'bg-slate-200 border-white group-hover:bg-indigo-300'} transition-all z-10`} />
                      </div>

                      <div className={`ml-8 flex-1 min-w-0 p-4 rounded-2xl border transition-all duration-200 flex items-center justify-between gap-2 sm:gap-3 ${
                        index === 0 
                          ? 'bg-gradient-to-r from-indigo-50/50 to-white border-indigo-100 shadow-sm' 
                          : 'bg-white border-slate-100 shadow-sm group-hover:shadow-md group-hover:border-indigo-200'
                      }`}>
                        {/* Text info — flex-1 min-w-0 để co giãn và tự truncate nếu quá dài */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-sm ${index === 0 ? 'text-indigo-700' : 'text-slate-700'}`}>
                              {index === 0 ? 'Mới nhất' : `Phiên bản ${v.version_number}`}
                            </span>
                            {index === 0 && <CheckCircle2 size={14} className="text-indigo-500 shrink-0" />}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mt-1.5">
                            <Clock size={12} className="shrink-0" />
                            <span className="truncate">{new Date(v.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                            <span className="mx-1 shrink-0">•</span>
                            <span className="truncate max-w-[120px]">{v.creator_name || 'You'}</span>
                          </div>
                        </div>

                        {/* Buttons — nằm GỌN TRONG card, shrink-0 để không bao giờ bị bóp méo */}
                        <div className="shrink-0 flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-150 focus-within:opacity-100">
                          <button
                            onClick={() => window.open(`/design/${designId}?versionId=${v.id}`, '_blank')}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-blue-500 hover:text-blue-600 rounded-xl shadow-sm hover:shadow whitespace-nowrap active:scale-95"
                          >
                            <Eye size={13} />
                            Xem trước
                          </button>
                          {isOwner && (
                            <button
                              onClick={() => onRestore(v.id)}
                              disabled={isRestoring}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 rounded-xl shadow-sm hover:shadow whitespace-nowrap active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <RotateCcw size={13} />
                              Khôi phục
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
