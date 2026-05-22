// src/components/editor/SheetEditor.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Sheet Editor hoàn chỉnh: CRUD dữ liệu, toolbar, resize cột/hàng, multi-select
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface CellData {
  value: string;
  bold?: boolean;
  italic?: boolean;
  bgColor?: string;
  textColor?: string;
  format?: 'text' | 'currency' | 'percent';
}

interface SheetData {
  cells: Record<string, CellData>; // key = "row,col" e.g. "0,0"
  colWidths: number[];
  rowHeights: number[];
  mergedCells?: string[]; // ["startRow,startCol,endRow,endCol", ...]
}

interface SheetEditorProps {
  page: any;
  onChange?: (pageId: string, data: any) => void;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DEFAULT_COLS = 20;
const DEFAULT_ROWS = 50;
const DEFAULT_COL_W = 100;
const DEFAULT_ROW_H = 28;
const HEADER_W = 42;

function colLabel(idx: number): string {
  let label = '';
  let n = idx;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

function cellKey(r: number, c: number) { return `${r},${c}`; }

function parseSheetData(raw: any): SheetData {
  if (!raw || typeof raw !== 'object') {
    return {
      cells: {},
      colWidths: Array.from({ length: DEFAULT_COLS }, () => DEFAULT_COL_W),
      rowHeights: Array.from({ length: DEFAULT_ROWS }, () => DEFAULT_ROW_H),
      mergedCells: [],
    };
  }
  return {
    cells: raw.cells || {},
    colWidths: raw.colWidths || Array.from({ length: DEFAULT_COLS }, () => DEFAULT_COL_W),
    rowHeights: raw.rowHeights || Array.from({ length: DEFAULT_ROWS }, () => DEFAULT_ROW_H),
    mergedCells: raw.mergedCells || [],
  };
}

function formatDisplay(cell: CellData | undefined): string {
  if (!cell || !cell.value) return '';
  if (cell.format === 'currency') {
    const n = parseFloat(cell.value);
    if (!isNaN(n)) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (cell.format === 'percent') {
    const n = parseFloat(cell.value);
    if (!isNaN(n)) return (n * 100).toFixed(1) + '%';
  }
  return cell.value;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function SheetEditor({ page, onChange }: SheetEditorProps) {
  // ── Parse dữ liệu từ page.content ──
  const initialData = useMemo(() => {
    if (typeof page?.content === 'string' && page.content.startsWith('{')) {
      try { return parseSheetData(JSON.parse(page.content)); } catch { /* fall through */ }
    }
    if (typeof page?.content === 'object' && page?.content !== null) {
      return parseSheetData(page.content);
    }
    return parseSheetData(null);
  }, []);

  const [data, setData] = useState<SheetData>(initialData);
  const [activeCell, setActiveCell] = useState<[number, number] | null>(null);
  const [editingCell, setEditingCell] = useState<[number, number] | null>(null);
  const [selStart, setSelStart] = useState<[number, number] | null>(null);
  const [selEnd, setSelEnd] = useState<[number, number] | null>(null);
  const [formulaBarValue, setFormulaBarValue] = useState('');
  const [isMouseSelecting, setIsMouseSelecting] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const numCols = data.colWidths.length;
  const numRows = data.rowHeights.length;

  // ── Debounced save ──
  const scheduleSave = useCallback((newData: SheetData) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (onChange && page?.id) {
        onChange(page.id, { content: JSON.stringify(newData) });
      }
    }, 500);
  }, [onChange, page?.id]);

  // ── Cell CRUD ──
  const getCell = useCallback((r: number, c: number): CellData | undefined => {
    return data.cells[cellKey(r, c)];
  }, [data.cells]);

  const updateCells = useCallback((updates: Record<string, Partial<CellData>>) => {
    setData(prev => {
      const newCells = { ...prev.cells };
      for (const [key, patch] of Object.entries(updates)) {
        const existing = newCells[key] || { value: '' };
        newCells[key] = { ...existing, ...patch };
        // Xoá ô trống hoàn toàn
        if (!newCells[key].value && !newCells[key].bold && !newCells[key].italic && !newCells[key].bgColor && !newCells[key].textColor) {
          delete newCells[key];
        }
      }
      const nd = { ...prev, cells: newCells };
      scheduleSave(nd);
      return nd;
    });
  }, [scheduleSave]);

  // ── Selection helpers ──
  const getSelectionBounds = useCallback(() => {
    if (!selStart) return null;
    const end = selEnd || selStart;
    return {
      r1: Math.min(selStart[0], end[0]),
      c1: Math.min(selStart[1], end[1]),
      r2: Math.max(selStart[0], end[0]),
      c2: Math.max(selStart[1], end[1]),
    };
  }, [selStart, selEnd]);

  const isSelected = useCallback((r: number, c: number) => {
    const b = getSelectionBounds();
    if (!b) return false;
    return r >= b.r1 && r <= b.r2 && c >= b.c1 && c <= b.c2;
  }, [getSelectionBounds]);

  // ── Cell click/double click ──
  const handleCellMouseDown = (r: number, c: number, e: React.MouseEvent) => {
    if (editingCell && (editingCell[0] !== r || editingCell[1] !== c)) {
      setEditingCell(null);
    }
    setActiveCell([r, c]);
    setSelStart([r, c]);
    setSelEnd(null);
    setIsMouseSelecting(true);
    const cell = getCell(r, c);
    setFormulaBarValue(cell?.value || '');
  };

  const handleCellMouseEnter = (r: number, c: number) => {
    if (isMouseSelecting) {
      setSelEnd([r, c]);
    }
  };

  useEffect(() => {
    const up = () => setIsMouseSelecting(false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const handleCellDoubleClick = (r: number, c: number) => {
    setEditingCell([r, c]);
    setActiveCell([r, c]);
    const cell = getCell(r, c);
    setFormulaBarValue(cell?.value || '');
    // Focus vào input
    setTimeout(() => {
      const inp = inputRefs.current.get(cellKey(r, c));
      if (inp) inp.focus();
    }, 0);
  };

  const handleCellChange = (r: number, c: number, value: string) => {
    setFormulaBarValue(value);
    updateCells({ [cellKey(r, c)]: { value } });
  };

  const handleCellBlur = () => {
    setEditingCell(null);
  };

  const handleCellKeyDown = (r: number, c: number, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setEditingCell(null);
      // Di chuyển xuống ô dưới
      if (r < numRows - 1) {
        setActiveCell([r + 1, c]);
        setSelStart([r + 1, c]);
        setSelEnd(null);
        setFormulaBarValue(getCell(r + 1, c)?.value || '');
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setEditingCell(null);
      if (c < numCols - 1) {
        setActiveCell([r, c + 1]);
        setSelStart([r, c + 1]);
        setSelEnd(null);
        setFormulaBarValue(getCell(r, c + 1)?.value || '');
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  // ── Global keyboard (Delete/Backspace, arrow keys) ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!tableRef.current?.contains(document.activeElement) && document.activeElement !== tableRef.current) return;
      if (editingCell) return; // Đang edit thì không bắt

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const b = getSelectionBounds();
        if (b) {
          const updates: Record<string, Partial<CellData>> = {};
          for (let r = b.r1; r <= b.r2; r++) {
            for (let c = b.c1; c <= b.c2; c++) {
              updates[cellKey(r, c)] = { value: '' };
            }
          }
          updateCells(updates);
          if (activeCell) setFormulaBarValue('');
        }
        return;
      }

      // Arrow navigation
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && activeCell) {
        e.preventDefault();
        let [r, c] = activeCell;
        if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
        if (e.key === 'ArrowDown') r = Math.min(numRows - 1, r + 1);
        if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
        if (e.key === 'ArrowRight') c = Math.min(numCols - 1, c + 1);
        setActiveCell([r, c]);
        setSelStart([r, c]);
        setSelEnd(null);
        setFormulaBarValue(getCell(r, c)?.value || '');
        return;
      }

      // Nhập ký tự bắt đầu edit
      if (activeCell && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setEditingCell(activeCell);
        handleCellChange(activeCell[0], activeCell[1], e.key);
        setFormulaBarValue(e.key);
        setTimeout(() => {
          const inp = inputRefs.current.get(cellKey(activeCell[0], activeCell[1]));
          if (inp) { inp.focus(); inp.setSelectionRange(1, 1); }
        }, 0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingCell, activeCell, getSelectionBounds, updateCells, numRows, numCols, getCell]);

  // ── Toolbar actions ──
  const applyToSelection = useCallback((patch: Partial<CellData>) => {
    const b = getSelectionBounds();
    if (!b) return;
    const updates: Record<string, Partial<CellData>> = {};
    for (let r = b.r1; r <= b.r2; r++) {
      for (let c = b.c1; c <= b.c2; c++) {
        updates[cellKey(r, c)] = patch;
      }
    }
    updateCells(updates);
  }, [getSelectionBounds, updateCells]);

  const toggleBold = () => {
    const b = getSelectionBounds();
    if (!b) return;
    const first = getCell(b.r1, b.c1);
    applyToSelection({ bold: !(first?.bold) });
  };

  const toggleItalic = () => {
    const b = getSelectionBounds();
    if (!b) return;
    const first = getCell(b.r1, b.c1);
    applyToSelection({ italic: !(first?.italic) });
  };

  // ── Column resize ──
  const [resizingCol, setResizingCol] = useState<number | null>(null);

  const handleColResizeStart = (colIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol(colIdx);
    const startX = e.clientX;
    const startW = data.colWidths[colIdx];

    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(40, startW + (ev.clientX - startX));
      setData(prev => {
        const cw = [...prev.colWidths];
        cw[colIdx] = newW;
        return { ...prev, colWidths: cw };
      });
    };
    const onUp = () => {
      setResizingCol(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // Save
      setData(prev => { scheduleSave(prev); return prev; });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Row resize ──
  const handleRowResizeStart = (rowIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = data.rowHeights[rowIdx];

    const onMove = (ev: MouseEvent) => {
      const newH = Math.max(20, startH + (ev.clientY - startY));
      setData(prev => {
        const rh = [...prev.rowHeights];
        rh[rowIdx] = newH;
        return { ...prev, rowHeights: rh };
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setData(prev => { scheduleSave(prev); return prev; });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Check toolbar state ──
  const firstSelectedCell = useMemo(() => {
    const b = getSelectionBounds();
    if (!b) return undefined;
    return getCell(b.r1, b.c1);
  }, [getSelectionBounds, getCell, data.cells]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white" style={{ fontFamily: 'Inter, Segoe UI, sans-serif' }}>

      {/* ── TOOLBAR ── */}
      <div className="h-10 bg-white border-b border-slate-200 flex items-center px-3 gap-1 shrink-0 z-20">
        {/* Bold */}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={toggleBold}
          className={`w-7 h-7 flex items-center justify-center rounded text-xs font-extrabold transition ${firstSelectedCell?.bold ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300' : 'text-slate-600 hover:bg-slate-100'}`}
          title="In đậm"
        >B</button>

        {/* Italic */}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={toggleItalic}
          className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold italic transition ${firstSelectedCell?.italic ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300' : 'text-slate-600 hover:bg-slate-100'}`}
          title="In nghiêng"
        >I</button>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* Text Color */}
        <label className="w-7 h-7 flex flex-col items-center justify-center rounded cursor-pointer hover:bg-slate-100 transition gap-0" title="Màu chữ">
          <span className="text-[10px] font-black text-slate-600 leading-none">A</span>
          <input type="color" className="absolute opacity-0 w-0 h-0" onChange={e => applyToSelection({ textColor: e.target.value })} />
          <div className="w-4 h-[3px] rounded-full bg-red-500" />
        </label>

        {/* Background Color */}
        <label className="w-7 h-7 flex items-center justify-center rounded cursor-pointer hover:bg-slate-100 transition" title="Màu nền ô">
          <input type="color" className="absolute opacity-0 w-0 h-0" onChange={e => applyToSelection({ bgColor: e.target.value })} />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 14.66V20a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h5.34" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 2l4 4-10 10H8v-4L18 2z" />
          </svg>
        </label>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* Currency */}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={() => applyToSelection({ format: firstSelectedCell?.format === 'currency' ? 'text' : 'currency' })}
          className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold transition ${firstSelectedCell?.format === 'currency' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300' : 'text-slate-600 hover:bg-slate-100'}`}
          title="Định dạng tiền tệ"
        >$</button>

        {/* Percent */}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={() => applyToSelection({ format: firstSelectedCell?.format === 'percent' ? 'text' : 'percent' })}
          className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold transition ${firstSelectedCell?.format === 'percent' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300' : 'text-slate-600 hover:bg-slate-100'}`}
          title="Định dạng phần trăm"
        >%</button>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* Thêm hàng */}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={() => setData(prev => {
            const nd = { ...prev, rowHeights: [...prev.rowHeights, DEFAULT_ROW_H] };
            scheduleSave(nd);
            return nd;
          })}
          className="px-2 h-7 flex items-center gap-1 rounded text-[10px] font-bold text-slate-500 hover:bg-slate-100 transition"
          title="Thêm hàng"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Row
        </button>

        {/* Thêm cột */}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={() => setData(prev => {
            const nd = { ...prev, colWidths: [...prev.colWidths, DEFAULT_COL_W] };
            scheduleSave(nd);
            return nd;
          })}
          className="px-2 h-7 flex items-center gap-1 rounded text-[10px] font-bold text-slate-500 hover:bg-slate-100 transition"
          title="Thêm cột"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Col
        </button>

        {/* Formula bar */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400">
            {activeCell ? `${colLabel(activeCell[1])}${activeCell[0] + 1}` : '—'}
          </span>
          <input
            type="text"
            value={formulaBarValue}
            onChange={e => {
              setFormulaBarValue(e.target.value);
              if (activeCell) {
                updateCells({ [cellKey(activeCell[0], activeCell[1])]: { value: e.target.value } });
              }
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && activeCell) {
                setEditingCell(null);
                (tableRef.current as any)?.focus();
              }
            }}
            className="w-48 h-6 px-2 text-xs font-medium border border-slate-200 rounded bg-white text-slate-800 outline-none focus:ring-1 focus:ring-indigo-300"
            placeholder="Value"
          />
        </div>
      </div>

      {/* ── TABLE AREA ── */}
      <div
        ref={tableRef}
        className="flex-1 overflow-auto relative outline-none"
        tabIndex={0}
        style={{ userSelect: 'none' }}
      >
        <table className="border-collapse w-full" style={{ tableLayout: 'fixed', minWidth: HEADER_W + data.colWidths.reduce((a, b) => a + b, 0) }}>
          {/* Column widths */}
          <colgroup>
            <col style={{ width: HEADER_W }} />
            {data.colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>

          {/* Header row */}
          <thead>
            <tr>
              <th className="border border-slate-300 bg-slate-100 sticky top-0 left-0 z-30" style={{ width: HEADER_W, minWidth: HEADER_W }} />
              {data.colWidths.map((w, ci) => (
                <th
                  key={ci}
                  className="border border-slate-300 bg-slate-100 text-[11px] font-semibold text-slate-500 sticky top-0 z-20 relative select-none"
                  style={{ width: w, minWidth: 40 }}
                >
                  {colLabel(ci)}
                  {/* Resize handle */}
                  <div
                    className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-400 transition-colors z-10"
                    onMouseDown={e => handleColResizeStart(ci, e)}
                  />
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {data.rowHeights.map((rh, ri) => (
              <tr key={ri} style={{ height: rh }}>
                {/* Row header */}
                <td
                  className="border border-slate-300 bg-slate-100 text-center text-[11px] font-semibold text-slate-500 sticky left-0 z-10 relative select-none"
                  style={{ width: HEADER_W, minWidth: HEADER_W }}
                >
                  {ri + 1}
                  {/* Row resize handle */}
                  <div
                    className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-indigo-400 transition-colors z-10"
                    onMouseDown={e => handleRowResizeStart(ri, e)}
                  />
                </td>

                {/* Data cells */}
                {data.colWidths.map((_, ci) => {
                  const cell = getCell(ri, ci);
                  const isAct = activeCell && activeCell[0] === ri && activeCell[1] === ci;
                  const isSel = isSelected(ri, ci);
                  const isEditing = editingCell && editingCell[0] === ri && editingCell[1] === ci;

                  return (
                    <td
                      key={ci}
                      className={`border relative transition-colors ${
                        isAct
                          ? 'border-indigo-500 border-2 z-10'
                          : isSel
                            ? 'border-indigo-300 bg-indigo-50/50'
                            : 'border-slate-200 hover:border-slate-300'
                      }`}
                      style={{
                        backgroundColor: cell?.bgColor || (isSel && !isAct ? 'rgba(99,102,241,0.06)' : undefined),
                        height: rh,
                        padding: 0,
                      }}
                      onMouseDown={e => handleCellMouseDown(ri, ci, e)}
                      onMouseEnter={() => handleCellMouseEnter(ri, ci)}
                      onDoubleClick={() => handleCellDoubleClick(ri, ci)}
                    >
                      {isEditing ? (
                        <input
                          ref={el => { if (el) inputRefs.current.set(cellKey(ri, ci), el); }}
                          type="text"
                          value={cell?.value || ''}
                          onChange={e => handleCellChange(ri, ci, e.target.value)}
                          onBlur={handleCellBlur}
                          onKeyDown={e => handleCellKeyDown(ri, ci, e)}
                          className="w-full h-full outline-none px-1.5 text-sm bg-white border-none"
                          style={{
                            fontWeight: cell?.bold ? 700 : 400,
                            fontStyle: cell?.italic ? 'italic' : 'normal',
                            color: cell?.textColor || '#1e293b',
                          }}
                          autoFocus
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center px-1.5 text-sm truncate cursor-cell"
                          style={{
                            fontWeight: cell?.bold ? 700 : 400,
                            fontStyle: cell?.italic ? 'italic' : 'normal',
                            color: cell?.textColor || '#1e293b',
                          }}
                        >
                          {formatDisplay(cell)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── STATUS BAR ── */}
      <div className="h-6 bg-[#217346] flex items-center px-4 gap-4 text-[10px] text-emerald-100 font-medium shrink-0">
        <span>Sheet Mode</span>
        <span>·</span>
        <span>{numCols} cols × {numRows} rows</span>
        <span>·</span>
        <span>{Object.keys(data.cells).length} cells filled</span>
        <span className="ml-auto">KanvaPro Sheets</span>
      </div>
    </div>
  );
}