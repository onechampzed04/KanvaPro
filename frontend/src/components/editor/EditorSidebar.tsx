// src/components/editor/EditorSidebar.tsx
import React from 'react';
import { Square, ImageIcon, Type, Search, Sparkles, Layers, PenTool } from 'lucide-react';

interface EditorSidebarProps {
  activeTab: string | null;
  setActiveTab: (tab: string | null) => void;
  currentPageType: string;
  showPositionBox?: boolean;
  onTogglePositionBox?: () => void;
}

export default function EditorSidebar({
  activeTab, setActiveTab, currentPageType, showPositionBox, onTogglePositionBox
}: EditorSidebarProps) {
  const isCanvas = currentPageType === 'canvas';

  const tabs = [
    { id: 'tools', icon: PenTool, label: 'Tools', show: isCanvas },
    { id: 'elements', icon: Square, label: 'Elements', show: isCanvas },
    { id: 'uploads', icon: ImageIcon, label: 'Uploads', show: true },
    { id: 'text', icon: Type, label: 'Text', show: true },
    { id: 'ai_image', icon: Sparkles, label: 'AI Image', show: isCanvas },
  ];

  return (
    <div className="flex h-full shrink-0 z-[70]">
      <div className="w-[72px] bg-white/60 backdrop-blur-xl text-slate-500 flex flex-col items-center py-4 gap-1 border-r border-white/60 shadow-sm">
        {tabs.filter(t => t.show).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(activeTab === tab.id ? null : tab.id)}
            className={`w-14 h-14 flex flex-col items-center justify-center gap-1 rounded-xl transition-all duration-200 group ${activeTab === tab.id
              ? 'bg-pink-100 text-pink-600 shadow-sm border border-pink-200'
              : 'hover:bg-white/80 hover:text-indigo-500 hover:shadow-sm hover:scale-105'
              }`}
          >
            <tab.icon size={22} strokeWidth={2.5} />
            <span className="text-[10px] font-extrabold uppercase tracking-tighter">{tab.label}</span>
          </button>
        ))}

        {/* Divider */}
        {isCanvas && <div className="w-10 h-px bg-slate-200/80 my-1" />}

        {/* Layer Panel Toggle */}
        {isCanvas && (
          <button
            onClick={onTogglePositionBox}
            className={`w-14 h-14 flex flex-col items-center justify-center gap-1 rounded-xl transition-all duration-200 group ${showPositionBox
                ? 'bg-indigo-100 text-indigo-600 shadow-sm border border-indigo-200'
              : 'hover:bg-white/80 hover:text-indigo-500 hover:shadow-sm hover:scale-105'
              }`}
            title="Layer Panel"
          >
            <Layers size={22} strokeWidth={2.5} />
            <span className="text-[10px] font-extrabold uppercase tracking-tighter">Layers</span>
          </button>
        )}
      </div>
    </div>
  );
}