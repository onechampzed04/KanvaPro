// src/components/editor/SheetEditor.tsx
import React from 'react';

export default function SheetEditor({ page }: { page: any }) {
  const cols = Array.from({ length: 15 }, (_, i) => String.fromCharCode(65 + i));
  const rows = Array.from({ length: 30 }, (_, i) => i + 1);

  return (
    <div className="w-full h-full bg-white shadow-xl overflow-auto border border-slate-300">
      <div className="sticky top-0 left-0 z-20 bg-slate-100 border-b border-slate-300 flex items-center px-4 py-2 gap-4">
         <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded text-xs font-bold">Sheet Mode</span>
         <span className="text-xs text-slate-500 font-medium italic">Giao diện bảng tính đang được phát triển...</span>
      </div>
      <table className="border-collapse w-full">
        <thead>
          <tr>
            <th className="border border-slate-300 bg-slate-100 w-10 sticky top-0 left-0 z-10"></th>
            {cols.map(c => <th key={c} className="border border-slate-300 bg-slate-100 min-w-[100px] p-1 text-xs text-slate-600 sticky top-0">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r}>
              <td className="border border-slate-300 bg-slate-100 text-center text-xs text-slate-500 sticky left-0">{r}</td>
              {cols.map(c => <td key={`${c}${r}`} className="border border-slate-200 outline-none hover:border-blue-500 cursor-cell"><input type="text" className="w-full h-full outline-none px-2 py-1 text-sm bg-transparent focus:bg-blue-50/30" /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}