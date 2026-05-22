// src/components/editor/DocEditor.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Cấu trúc mới: Một contentEditable DUY NHẤT cho toàn bộ tài liệu.
// Phân trang được giả lập bằng CSS (đường kẻ ngang cứ mỗi PAGE_H pixel),
// KHÔNG còn chia nhỏ DOM thành nhiều div → không mất cursor, không giật lag.
// ─────────────────────────────────────────────────────────────────────────────
import React, {
  useEffect, useRef, useCallback, useState,
  forwardRef, useImperativeHandle
} from 'react';
import { saveAs } from 'file-saver';
import {
  Document, Packer, Paragraph, TextRun,
  HeadingLevel, AlignmentType, UnderlineType
} from 'docx';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PAGE_H   = 1123;   // A4 chiều cao px (96dpi)
const PAGE_W   = 794;    // A4 chiều rộng px
const PAD_X    = 96;     // lề trái/phải (px)
const PAD_Y    = 96;     // lề trên/dưới (px)

const FONTS = [
  'Arial', 'Times New Roman', 'Calibri', 'Georgia',
  'Verdana', 'Roboto', 'Courier New', 'Trebuchet MS'
];

// ─── PROPS & HANDLE ───────────────────────────────────────────────────────────
interface DocEditorProps {
  pages: any[];
  currentPageId: string | null;
  onChange: (id: string, data: any) => void;
  onInsertPage: (afterPageId: string, content?: string) => void;
}

export type DocEditorHandle = {
  exportDocx: () => Promise<void>;
  flushAll: () => Map<string, string>;
};

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────
function ToolBtn({ title, active, onClick, children }: any) {
  return (
    <button
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold transition
        ${active
          ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
          : 'text-slate-600 hover:bg-slate-100'
        }`}
    >{children}</button>
  );
}
function Sep() { return <div className="w-px h-5 bg-slate-200 mx-0.5" />; }

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
const DocEditor = forwardRef<DocEditorHandle, DocEditorProps>(function DocEditor(
  { pages, currentPageId, onChange, onInsertPage }, ref
) {
  // ── Refs ──
  const editorRef   = useRef<HTMLDivElement>(null);
  const saveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);
  const savedRangeRef = useRef<Range | null>(null);

  // ── State ──
  const [fontFamily, setFontFamily]   = useState('Calibri');
  const [fontSize,   setFontSize]     = useState(12);
  const [wordCount,  setWordCount]    = useState(0);
  const [pageCount,  setPageCount]    = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  // ── Lấy trang đầu tiên dạng doc để đọc/ghi content ──
  const firstDocPage = pages.find(p => p.type === 'doc') || pages[0];

  // ── Khởi tạo nội dung HTML vào editor (chỉ làm 1 lần khi mount) ──
  useEffect(() => {
    if (initializedRef.current || !editorRef.current || !firstDocPage) return;

    // Gom nội dung từ TẤT CẢ các trang doc (backward-compatible với format cũ)
    let combined = '';
    pages
      .filter(p => p.type === 'doc' || !p.type)
      .forEach((p, idx) => {
        const raw = p.content || '';
        if (raw) combined += (idx > 0 ? '' : '') + raw;
      });

    editorRef.current.innerHTML = combined || '<p><br></p>';
    initializedRef.current = true;
    updateWordCount();
    updatePageCount();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length]);

  // ── Cập nhật content khi pages thay đổi từ ngoài (ví dụ: remote collab) ──
  useEffect(() => {
    if (!editorRef.current || initializedRef.current) return;
    const raw = firstDocPage?.content || '';
    editorRef.current.innerHTML = raw || '<p><br></p>';
    initializedRef.current = true;
    updateWordCount();
    updatePageCount();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDocPage?.content]);

  // ── Đếm từ ──
  const updateWordCount = useCallback(() => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    setWordCount(text.trim().split(/\s+/).filter(Boolean).length);
  }, []);

  // ── Tính số trang dựa trên chiều cao nội dung ──
  const updatePageCount = useCallback(() => {
    if (!editorRef.current) return;
    const contentH = editorRef.current.scrollHeight;
    setPageCount(Math.max(1, Math.ceil(contentH / PAGE_H)));
  }, []);

  // ── Flush content → trả về Map pageId → html ──
  // Lưu toàn bộ vào trang đầu tiên. Các trang cũ còn lại được xóa content.
  const flushAll = useCallback((): Map<string, string> => {
    const map = new Map<string, string>();
    if (!editorRef.current || !firstDocPage) return map;

    const html = editorRef.current.innerHTML;
    map.set(firstDocPage.id, html);
    onChange(firstDocPage.id, { content: html });

    // Xóa content của các trang doc cũ (nếu có nhiều trang)
    pages
      .filter(p => p.id !== firstDocPage.id && (p.type === 'doc' || !p.type))
      .forEach(p => {
        map.set(p.id, '');
        onChange(p.id, { content: '' });
      });

    return map;
  }, [firstDocPage, onChange, pages]);

  // ── Xử lý input ──
  const handleInput = useCallback(() => {
    if (!editorRef.current || !firstDocPage) return;

    updateWordCount();
    updatePageCount();

    // Debounce 400ms → cập nhật state
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const html = editorRef.current?.innerHTML || '';
      onChange(firstDocPage.id, { content: html });
    }, 400);
  }, [firstDocPage, onChange, updateWordCount, updatePageCount]);

  // ── Lưu vùng chọn mỗi khi người dùng tương tác trong editor ──
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current) {
      const range = sel.getRangeAt(0);
      // Chỉ lưu nếu vùng chọn nằm bên trong editor
      if (editorRef.current.contains(range.commonAncestorContainer)) {
        // Clone boundaries thành plain object (sống sót qua focus change)
        savedRangeRef.current = {
          startContainer: range.startContainer,
          startOffset: range.startOffset,
          endContainer: range.endContainer,
          endOffset: range.endOffset,
        } as any;
      }
    }
  }, []);

  // ── Khôi phục vùng chọn đã lưu ──
  const restoreSelection = useCallback(() => {
    const saved = savedRangeRef.current as any;
    if (!saved) return false;
    try {
      // Focus lại editor trước
      editorRef.current?.focus();
      const range = document.createRange();
      range.setStart(saved.startContainer, saved.startOffset);
      range.setEnd(saved.endContainer, saved.endOffset);
      const sel = window.getSelection();
      if (!sel) return false;
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    } catch {
      return false;
    }
  }, []);

  // ── execCommand helpers ──
  const cmd     = (command: string, value?: string) => document.execCommand(command, false, value);
  const cmdWithRestore = useCallback((command: string, value?: string) => {
    // Khôi phục vùng chọn trước khi áp dụng lệnh (dành cho color picker)
    restoreSelection();
    document.execCommand(command, false, value);
    handleInput();
  }, [restoreSelection]);
  const isActive = (c: string) => { try { return document.queryCommandState(c); } catch { return false; } };

  const applyFontSize = useCallback((size: number) => {
    setFontSize(size);
    document.execCommand('fontSize', false, '7');
    document.querySelectorAll('font[size="7"]').forEach(el => {
      (el as HTMLElement).removeAttribute('size');
      (el as HTMLElement).style.fontSize = `${size}pt`;
    });
  }, []);

  // ── Export DOCX ──
  const exportDocx = useCallback(async () => {
    setIsExporting(true);
    try {
      const html = editorRef.current?.innerHTML || firstDocPage?.content || '';
      const tmp = document.createElement('div');
      tmp.innerHTML = html;

      const allParagraphs: Paragraph[] = [];

      const buildRuns = (node: HTMLElement): TextRun[] => {
        const runs: TextRun[] = [];
        node.childNodes.forEach(child => {
          if (child.nodeType === Node.TEXT_NODE) {
            if (child.textContent) runs.push(new TextRun({ text: child.textContent }));
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            const c = child as HTMLElement;
            const tag = c.tagName.toUpperCase();
            const bold      = tag === 'B' || tag === 'STRONG' || c.style.fontWeight === 'bold';
            const italics   = tag === 'I' || tag === 'EM' || c.style.fontStyle === 'italic';
            const underline = (tag === 'U' || c.style.textDecoration?.includes('underline'))
              ? { type: UnderlineType.SINGLE } : undefined;
            const color = c.style.color?.replace('#', '') || undefined;
            const size  = c.style.fontSize ? parseInt(c.style.fontSize) * 2 : undefined;
            const font  = c.style.fontFamily?.replace(/['"]/g, '') || undefined;
            const inner = buildRuns(c);
            if (inner.length > 0) {
              inner.forEach(r => runs.push(new TextRun({
                ...(r as any),
                bold: (r as any).bold || bold,
                italics: (r as any).italics || italics,
              })));
            } else if (c.innerText) {
              runs.push(new TextRun({ text: c.innerText, bold, italics, underline, color, size, font }));
            }
          }
        });
        return runs;
      };

      tmp.childNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el  = node as HTMLElement;
        const tag = el.tagName.toUpperCase();
        let heading: typeof HeadingLevel[keyof typeof HeadingLevel] | undefined;
        if (tag === 'H1') heading = HeadingLevel.HEADING_1;
        else if (tag === 'H2') heading = HeadingLevel.HEADING_2;
        else if (tag === 'H3') heading = HeadingLevel.HEADING_3;

        const align = el.style.textAlign;
        let alignment: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT;
        if (align === 'center') alignment = AlignmentType.CENTER;
        else if (align === 'right') alignment = AlignmentType.RIGHT;
        else if (align === 'justify') alignment = AlignmentType.JUSTIFIED;

        const runs = buildRuns(el);
        allParagraphs.push(new Paragraph({
          heading, alignment,
          children: runs.length > 0 ? runs : [new TextRun('')],
        }));
      });

      if (allParagraphs.length === 0) allParagraphs.push(new Paragraph({ children: [new TextRun('')] }));

      const doc  = new Document({ sections: [{ properties: {}, children: allParagraphs }] });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, 'Document.docx');
    } catch (err) {
      console.error('DOCX export error:', err);
      alert('Lỗi xuất file DOCX!');
    } finally {
      setIsExporting(false);
    }
  }, [firstDocPage]);

  useImperativeHandle(ref, () => ({ exportDocx, flushAll }), [exportDocx, flushAll]);

  // ── CSS: vẽ đường phân trang bằng background-image ──
  // Cứ mỗi PAGE_H px vẽ 1 đường ngang màu xanh dương nhạt (giống Google Docs)
  const pageLineStyle: React.CSSProperties = {
    backgroundImage: `repeating-linear-gradient(
      to bottom,
      transparent 0px,
      transparent ${PAGE_H - 1}px,
      #b8c7e0 ${PAGE_H - 1}px,
      #b8c7e0 ${PAGE_H + 15}px,
      transparent ${PAGE_H + 15}px
    )`,
    backgroundSize: `100% ${PAGE_H + 15}px`,
  };

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      style={{ background: '#e8eaed', fontFamily: 'Inter, sans-serif' }}
    >
      {/* ── Ribbon Toolbar ── */}
      <div className="bg-white border-b border-slate-200 shadow-sm px-3 py-1.5 flex flex-wrap items-center gap-1 z-20 shrink-0">

        {/* Export */}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={exportDocx}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transition shadow-sm disabled:opacity-60 mr-2"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {isExporting ? 'Exporting...' : 'Export .docx'}
        </button>
        <Sep />

        {/* Font Family */}
        <select
          value={fontFamily}
          onChange={e => { setFontFamily(e.target.value); cmd('fontName', e.target.value); }}
          className="h-7 px-2 text-xs font-medium border border-slate-200 rounded bg-white text-slate-800 outline-none cursor-pointer"
          style={{ minWidth: 120 }}
        >
          {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>

        {/* Font Size */}
        <div className="flex items-center border border-slate-200 rounded bg-white overflow-hidden h-7">
          <input
            type="number" min={6} max={144} value={fontSize}
            onChange={e => { const s = Number(e.target.value); if (s >= 6 && s <= 144) applyFontSize(s); }}
            className="w-12 h-full text-xs font-medium text-center text-slate-800 outline-none border-none bg-white px-1"
          />
          <div className="flex flex-col h-full border-l border-slate-200">
            <button onMouseDown={e => e.preventDefault()} onClick={() => applyFontSize(Math.min(144, fontSize + 1))}
              className="flex-1 px-1 text-[9px] text-slate-400 hover:bg-slate-100 leading-none">▲</button>
            <button onMouseDown={e => e.preventDefault()} onClick={() => applyFontSize(Math.max(6, fontSize - 1))}
              className="flex-1 px-1 text-[9px] text-slate-400 hover:bg-slate-100 leading-none border-t border-slate-200">▼</button>
          </div>
        </div>
        <Sep />

        {/* Heading */}
        <select
          defaultValue=""
          onChange={e => { cmd('formatBlock', e.target.value); (e.target as any).value = ''; }}
          className="h-7 px-2 text-xs font-medium border border-slate-200 rounded bg-white text-slate-800 outline-none cursor-pointer"
          style={{ width: 104 }}
        >
          <option value="" disabled>Paragraph ▾</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="p">Normal</option>
        </select>
        <Sep />

        {/* B I U S */}
        <ToolBtn title="Bold (Ctrl+B)"      active={isActive('bold')}          onClick={() => cmd('bold')}><strong>B</strong></ToolBtn>
        <ToolBtn title="Italic (Ctrl+I)"    active={isActive('italic')}        onClick={() => cmd('italic')}><em>I</em></ToolBtn>
        <ToolBtn title="Underline (Ctrl+U)" active={isActive('underline')}     onClick={() => cmd('underline')}><u>U</u></ToolBtn>
        <ToolBtn title="Strikethrough"      active={isActive('strikeThrough')} onClick={() => cmd('strikeThrough')}><s>S</s></ToolBtn>
        <Sep />

        {/* Align */}
        <ToolBtn title="Align Left"   active={isActive('justifyLeft')}   onClick={() => cmd('justifyLeft')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
        </ToolBtn>
        <ToolBtn title="Center"       active={isActive('justifyCenter')} onClick={() => cmd('justifyCenter')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
        </ToolBtn>
        <ToolBtn title="Align Right"  active={isActive('justifyRight')}  onClick={() => cmd('justifyRight')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>
        </ToolBtn>
        <ToolBtn title="Justify"      active={isActive('justifyFull')}   onClick={() => cmd('justifyFull')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </ToolBtn>
        <Sep />

        {/* Lists */}
        <ToolBtn title="Bullet List"   active={isActive('insertUnorderedList')} onClick={() => cmd('insertUnorderedList')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="9" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="9" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>
        </ToolBtn>
        <ToolBtn title="Numbered List" active={isActive('insertOrderedList')}   onClick={() => cmd('insertOrderedList')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" fontSize="7" fill="currentColor">1</text><text x="2" y="14" fontSize="7" fill="currentColor">2</text></svg>
        </ToolBtn>
        <Sep />

        {/* Indent */}
        <ToolBtn title="Indent"  active={false} onClick={() => cmd('indent')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6"/><polyline points="7 10 11 14 7 18"/><line x1="11" y1="14" x2="21" y2="14"/></svg>
        </ToolBtn>
        <ToolBtn title="Outdent" active={false} onClick={() => cmd('outdent')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6"/><polyline points="11 10 7 14 11 18"/><line x1="7" y1="14" x2="21" y2="14"/></svg>
        </ToolBtn>
        <Sep />

        {/* Text Color / Highlight */}
        <label
          className="w-7 h-7 flex flex-col items-center justify-center rounded cursor-pointer hover:bg-slate-100 transition gap-0.5"
          title="Text Color"
          onMouseDown={saveSelection}
        >
          <span className="text-xs font-black text-slate-700 leading-none">A</span>
          <input type="color" className="absolute opacity-0 w-0 h-0" onChange={e => cmdWithRestore('foreColor', e.target.value)} />
          <div className="w-4 h-1 rounded-full bg-red-500" />
        </label>
        <label
          className="w-7 h-7 flex flex-col items-center justify-center rounded cursor-pointer hover:bg-slate-100 transition gap-0.5"
          title="Highlight"
          onMouseDown={saveSelection}
        >
          <span className="text-xs font-black text-slate-700 leading-none" style={{ background: '#ffe066', padding: '0 2px' }}>A</span>
          <input type="color" className="absolute opacity-0 w-0 h-0" onChange={e => cmdWithRestore('hiliteColor', e.target.value)} />
          <div className="w-4 h-1 rounded-full bg-yellow-300" />
        </label>
        <Sep />

        {/* Undo / Redo / Clear */}
        <ToolBtn title="Undo (Ctrl+Z)"      active={false} onClick={() => cmd('undo')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" d="M3 10h10a7 7 0 017 7v1"/><path strokeLinecap="round" d="M3 10l4-4m-4 4l4 4"/></svg>
        </ToolBtn>
        <ToolBtn title="Redo (Ctrl+Y)"      active={false} onClick={() => cmd('redo')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" d="M21 10H11a7 7 0 00-7 7v1"/><path strokeLinecap="round" d="M21 10l-4-4m4 4l-4 4"/></svg>
        </ToolBtn>
        <ToolBtn title="Clear Formatting"   active={false} onClick={() => cmd('removeFormat')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="20" x2="20" y2="4" stroke="#ef4444" strokeWidth="1.5"/><path strokeLinecap="round" d="M4 7h16M10 11v6M14 11v6"/></svg>
        </ToolBtn>

        <div className="ml-auto flex items-center gap-3 text-[10px] text-slate-400 font-medium">
          <span>~{pageCount} trang</span>
          <span>·</span>
          <span>{wordCount} từ</span>
        </div>
      </div>

      {/* ── Scrollable document area ── */}
      <div className="flex-1 overflow-y-auto" style={{ background: '#e8eaed' }}>
        <div className="flex justify-center py-8 pb-20">

          {/* Wrapper tạo bóng đổ + nền trắng A4 */}
          <div
            style={{
              width: PAGE_W,
              minHeight: PAGE_H,
              background: '#ffffff',
              boxShadow: '0 2px 24px rgba(0,0,0,0.15)',
              position: 'relative',
            }}
          >
            {/* Đường kẻ phân trang ảo (CSS pseudo-lines) */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 1,
                ...pageLineStyle,
              }}
            />

            {/* Label số trang nổi bên phải */}
            {pageCount > 1 && Array.from({ length: pageCount - 1 }).map((_, i) => (
              <div
                key={i}
                aria-hidden
                style={{
                  position: 'absolute',
                  top: PAGE_H * (i + 1) + 3,
                  right: 8,
                  fontSize: 10,
                  color: '#94a3b8',
                  fontWeight: 600,
                  pointerEvents: 'none',
                  zIndex: 2,
                  letterSpacing: '0.05em',
                  userSelect: 'none',
                }}
              >
                Trang {i + 2}
              </div>
            ))}

            {/* ── SINGLE contentEditable ── */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              onMouseUp={saveSelection}
              onKeyUp={saveSelection}
              spellCheck
              className="outline-none text-slate-800 prose max-w-none"
              style={{
                position: 'relative',
                zIndex: 3,
                minHeight: PAGE_H,
                padding: `${PAD_Y}px ${PAD_X}px`,
                fontFamily: fontFamily,
                fontSize: `${fontSize}pt`,
                lineHeight: 1.7,
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
                boxSizing: 'border-box',
                caretColor: '#6366f1',
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Status Bar (Google Docs style) ── */}
      <div className="h-6 bg-[#2b579a] flex items-center px-4 gap-4 text-[10px] text-blue-100 font-medium shrink-0">
        <span>Document Mode</span>
        <span>·</span>
        <span>{wordCount} words</span>
        <span>·</span>
        <span>~{pageCount} pages</span>
        <span>·</span>
        <span>A4 · 210 × 297 mm</span>
        <span className="ml-auto">KanvaPro Docs</span>
      </div>

      {/* ── Print styles (cho @media print) ── */}
      <style>{`
        @media print {
          .doc-editor-container { background: white !important; }
          .doc-editor-content {
            box-shadow: none !important;
            margin: 0 !important;
          }
        }
      `}</style>
    </div>
  );
});

export default DocEditor;