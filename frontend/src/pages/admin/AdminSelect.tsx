import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface AdminSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export default function AdminSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
  size = 'md',
}: AdminSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find(o => o.value === value);
  const isSm = size === 'sm';

  return (
    <div
      ref={ref}
      className={`adsel-wrap ${className}`}
      style={{ position: 'relative', display: 'inline-block', minWidth: isSm ? 120 : 150 }}
    >
      {/* Trigger button */}
      <button
        type="button"
        className={`adsel-trigger ${open ? 'adsel-open' : ''}`}
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: isSm ? '6px 10px' : '8px 12px',
          background: 'var(--ah)',
          border: open ? '1px solid var(--pr-l)' : '1px solid var(--bdr)',
          borderRadius: 'var(--rs)',
          color: selected ? 'var(--t1)' : 'var(--t3)',
          fontSize: isSm ? 12 : 13,
          fontWeight: 500,
          fontFamily: 'Inter, sans-serif',
          cursor: 'pointer',
          outline: 'none',
          transition: 'border-color .15s, box-shadow .15s, background .15s',
          boxShadow: open ? '0 0 0 3px rgba(139,92,246,.18)' : 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <span>{selected ? selected.label : placeholder}</span>
        <ChevronDown
          size={isSm ? 12 : 14}
          style={{
            flexShrink: 0,
            color: 'var(--t3)',
            transition: 'transform .2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Dropdown list */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 999,
            background: '#1a1f2e',
            border: '1px solid var(--bdr-a)',
            borderRadius: 'var(--rs)',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,.5)',
            animation: 'adselDrop .12s ease',
          }}
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: isSm ? '7px 10px' : '9px 12px',
                fontSize: isSm ? 12 : 13,
                fontWeight: opt.value === value ? 600 : 400,
                fontFamily: 'Inter, sans-serif',
                background: opt.value === value ? 'var(--pr-g)' : 'transparent',
                color: opt.value === value ? 'var(--pr-l)' : 'var(--t2)',
                border: 'none',
                cursor: 'pointer',
                transition: 'background .1s, color .1s',
              }}
              onMouseEnter={e => {
                if (opt.value !== value) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--ah)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--t1)';
                }
              }}
              onMouseLeave={e => {
                if (opt.value !== value) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)';
                }
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
