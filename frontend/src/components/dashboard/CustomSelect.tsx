import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface Option {
  label: string;
  value: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  icon?: React.ReactNode;
  className?: string;
}

export default function CustomSelect({ value, onChange, options, icon, className = '' }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value) || options[0];

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-50/50 text-slate-700 text-sm font-bold rounded-2xl px-4 py-2.5 outline-none transition-all duration-300 group"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {icon && <span className="text-slate-400 shrink-0 group-hover:text-indigo-500 transition-colors">{icon}</span>}
          <span className="truncate whitespace-nowrap">{selectedOption.label}</span>
        </div>
        <ChevronDown 
          size={16} 
          className={`text-slate-400 group-hover:text-indigo-500 transition-transform duration-300 ${isOpen ? 'rotate-180 text-indigo-500' : ''}`} 
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute z-[100] top-full mt-2 left-0 w-max min-w-full bg-white/90 backdrop-blur-xl border border-slate-200/60 shadow-2xl shadow-indigo-900/10 rounded-2xl max-h-[280px] overflow-y-auto custom-scrollbar"
          >
            <div className="py-2 flex flex-col gap-1 px-2">
              {options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`text-left px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
                    value === option.value
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${value === option.value ? 'bg-indigo-500' : 'bg-transparent'}`} />
                  {option.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
