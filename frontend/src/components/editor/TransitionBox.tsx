// src/components/editor/TransitionBox.tsx
interface TransitionBoxProps {
  pages: any[];
  transitionTargetId: string;
  setPages: (v: any) => void;
  onClose: () => void;
}

const PAGE_TRANSITIONS = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'slideLeft', label: 'Slide Left' },
  { id: 'slideRight', label: 'Slide Right' },
  { id: 'slideUp', label: 'Slide Up' },
  { id: 'slideDown', label: 'Slide Down' },
  { id: 'dissolve', label: 'Dissolve' },
  { id: 'zoom', label: 'Zoom' },
];

export default function TransitionBox({ pages, transitionTargetId, setPages, onClose }: TransitionBoxProps) {
  return (
    <div className="absolute left-4 top-6 w-64 bg-white/95 backdrop-blur shadow-2xl rounded-xl border border-slate-200 z-50 flex flex-col max-h-[70vh] overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex justify-between items-center shrink-0">
        <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Transition</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-rose-500 transition">✕</button>
      </div>

      <div className="p-4 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-2 gap-2">
          {PAGE_TRANSITIONS.map(trans => {
            const targetPage = pages.find(p => p.id === transitionTargetId);
            const isActive = (targetPage?.transition?.type || 'none') === trans.id;
            return (
              <button
                key={trans.id}
                onClick={() => {
                  setPages(pages.map(p =>
                    p.id === transitionTargetId
                      ? { ...p, transition: { type: trans.id, duration: 0.5 } }
                      : p
                  ));
                }}
                className={`py-3 px-1 text-[11px] leading-tight font-bold rounded-lg border transition-all ${
                  isActive
                    ? 'bg-indigo-100 border-indigo-500 text-indigo-700 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-white hover:shadow-sm'
                }`}
              >
                {trans.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
