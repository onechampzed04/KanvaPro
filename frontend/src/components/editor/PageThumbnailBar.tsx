// src/components/editor/PageThumbnailBar.tsx
import React from 'react';

interface PageBarProps {
  pages: any[];
  currentPageId: string | null;
  handlePageChange: (id: string) => void;
  handleAddPage: () => void;
  deletePage: (id: string) => void;
}

export default function PageThumbnailBar({ pages, currentPageId, handlePageChange, handleAddPage, deletePage }: PageBarProps) {
  return (
    <div className="h-32 bg-slate-100 border-t border-slate-300 flex items-center px-4 overflow-x-auto gap-4 shadow-inner">
      {pages.map((page, index) => (
        <div key={page.id} className="flex flex-col items-center gap-2 shrink-0">
          <button 
            onClick={() => handlePageChange(page.id)}
            className={`relative w-28 h-20 bg-white shadow-sm border-2 transition overflow-hidden ${
              currentPageId === page.id ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-transparent hover:border-slate-300'
            }`}
          >
            <span className="absolute top-1 left-1 bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-70 z-10">{index + 1}</span>
            {page.id === currentPageId ? (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-indigo-500 font-bold bg-indigo-50">Editing</div>
            ) : page.thumbnail ? (
              <img src={page.thumbnail} alt={`Page ${index + 1}`} className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 bg-white">Empty</div>
            )}
          </button>
          {pages.length > 1 && (
            <button onClick={() => deletePage(page.id)} className="text-[10px] text-red-400 hover:text-red-600 font-bold">Xóa</button>
          )}
        </div>
      ))}
      <button onClick={handleAddPage} className="shrink-0 w-12 h-20 bg-white border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 rounded flex items-center justify-center text-slate-400 transition">
        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
      </button>
    </div>
  );
}