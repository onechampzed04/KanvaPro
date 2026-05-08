// src/components/editor/VersionHistoryModal.tsx
interface VersionHistoryModalProps {
  versions: any[];
  isRestoring: boolean;
  onClose: () => void;
  onRestore: (versionId: string) => void;
}

export default function VersionHistoryModal({ versions, isRestoring, onClose, onRestore }: VersionHistoryModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[450px] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
          <h2 className="font-extrabold text-slate-800 uppercase">Version History</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto bg-slate-100 space-y-2">
          {versions.length === 0 ? (
            <div className="text-center text-slate-500 py-8 text-sm">Chưa có phiên bản lịch sử nào.</div>
          ) : (
            versions.map((v, index) => (
              <div
                key={v.id}
                className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex justify-between items-center group hover:border-indigo-300 transition"
              >
                <div>
                  <div className="font-bold text-sm text-slate-800">
                    {index === 0 ? 'Current Version' : `Version ${v.version_number}`}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {new Date(v.created_at).toLocaleString('vi-VN')} • by {v.creator_name || 'You'}
                  </div>
                </div>
                {index !== 0 && (
                  <button
                    onClick={() => onRestore(v.id)}
                    disabled={isRestoring}
                    className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-600 hover:text-white rounded opacity-0 group-hover:opacity-100 transition"
                  >
                    Restore
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
