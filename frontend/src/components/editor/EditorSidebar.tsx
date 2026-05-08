import React from 'react';
import { Square, ImageIcon, Type, Upload, Search, Sparkles } from 'lucide-react';

export default function EditorSidebar(props: any) {
  const { 
    activeTab, setActiveTab, handleFontUpload, currentPageType 
  } = props;

  const isCanvas = currentPageType === 'canvas';

  const tabs = [
    { id: 'elements', icon: Square, label: 'Elements', show: isCanvas },
    { id: 'uploads', icon: ImageIcon, label: 'Uploads', show: true },
    { id: 'text', icon: Type, label: 'Text', show: true },
    { id: 'ai_image', icon: Sparkles, label: 'AI Image', show: isCanvas },
  ];

  return (
    <div className="flex h-full shrink-0 z-[70]">
      <div className="w-[72px] bg-white/60 backdrop-blur-xl text-slate-500 flex flex-col items-center py-4 gap-4 border-r border-white/60 shadow-sm">
        {tabs.filter(t => t.show).map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(activeTab === tab.id ? null : tab.id)}
            onMouseEnter={() => setActiveTab(tab.id)}
            className={`w-14 h-14 flex flex-col items-center justify-center gap-1 rounded-xl transition-all ${
              activeTab === tab.id ? 'bg-pink-100 text-pink-600 shadow-sm border border-pink-200' : 'hover:bg-white/80 hover:text-indigo-500 hover:shadow-sm'
            }`}
          >
            <tab.icon size={22} strokeWidth={2.5} />
            <span className="text-[10px] font-extrabold uppercase tracking-tighter">{tab.label}</span>
          </button>
        ))}
        
        <label className="w-14 h-14 flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-white/80 hover:text-indigo-500 hover:shadow-sm rounded-xl mt-auto mb-2 transition-all">
          <Upload size={20} strokeWidth={2.5} />
          <span className="text-[10px] font-extrabold text-center uppercase">Font</span>
          <input type="file" accept=".ttf,.otf" onChange={handleFontUpload} className="hidden" />
        </label>
      </div>
    </div>
  );
}