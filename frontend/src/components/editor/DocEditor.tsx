// src/components/editor/DocEditor.tsx
import React from 'react';

interface DocEditorProps {
  page: any;
  onChange: (id: string, data: any) => void;
}

export default function DocEditor({ page, onChange }: DocEditorProps) {
  return (
    <div className="w-full max-w-[800px] h-full bg-white shadow-xl p-12 overflow-y-auto">
      <div className="text-sm text-slate-400 mb-8 border-b pb-4 flex justify-between items-center">
        <span>Document Mode</span>
        <span className="bg-sky-100 text-sky-600 px-2 py-1 rounded text-xs font-bold">Doc</span>
      </div>
      <textarea 
        className="w-full h-full min-h-[500px] outline-none resize-none text-slate-800 leading-relaxed text-lg"
        placeholder="Bắt đầu nhập nội dung tài liệu của bạn vào đây..."
        defaultValue={page.content || ''}
        onChange={(e) => onChange(page.id, { content: e.target.value })}
      />
    </div>
  );
}