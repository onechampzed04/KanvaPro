// src/components/editor/DocEditor.tsx — Tiptap-based rewrite
import React, { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { io as ioConnect, Socket } from 'socket.io-client';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, UnderlineType, ShadingType } from 'docx';

// ─── REMOTE CURSOR PLUGIN (ProseMirror Decoration) ─────────────────────────
// Render cursor của các collaborator khác trực tiếp trong DOM editor.
// Mỗi cursor = một vertical line + label email phía trên, màu theo avatarColor.
export interface RemoteCursor {
  userId: string;
  email: string;
  avatarColor: string;
  from: number;
  to: number;
}

const remoteCursorKey = new PluginKey<RemoteCursor[]>('remoteCursors');

function createCursorElement(cursor: RemoteCursor): HTMLElement {
  const wrap = document.createElement('span');
  wrap.style.cssText = 'position:relative; display:inline; pointer-events:none;';

  // Vertical cursor line
  const line = document.createElement('span');
  line.style.cssText = `
    position: absolute; top: 0; left: 0;
    width: 2px; height: 1.2em;
    background: ${cursor.avatarColor};
    border-radius: 1px;
    display: inline-block;
    transform: translateX(-1px);
  `;

  // Email label above cursor
  const label = document.createElement('span');
  label.textContent = cursor.email.split('@')[0];
  label.style.cssText = `
    position: absolute; bottom: 100%; left: 0;
    background: ${cursor.avatarColor};
    color: #fff;
    font-size: 10px;
    font-family: -apple-system, sans-serif;
    padding: 1px 5px;
    border-radius: 3px 3px 3px 0;
    white-space: nowrap;
    pointer-events: none;
    z-index: 100;
  `;

  wrap.appendChild(label);
  wrap.appendChild(line);
  return wrap;
}

const RemoteCursorPlugin = new Plugin({
  key: remoteCursorKey,
  state: {
    init: () => [] as RemoteCursor[],
    apply(tr, cursors) {
      const meta = tr.getMeta(remoteCursorKey);
      if (meta !== undefined) return meta as RemoteCursor[];
      // Map positions khi document thay đổi
      if (!tr.docChanged) return cursors;
      return cursors.map(c => ({
        ...c,
        from: tr.mapping.map(c.from),
        to: tr.mapping.map(c.to),
      })).filter(c => c.from >= 0 && c.to >= 0);
    },
  },
  props: {
    decorations(state) {
      const cursors = remoteCursorKey.getState(state) ?? [];
      if (!cursors.length) return DecorationSet.empty;
      const decos: Decoration[] = [];
      const docSize = state.doc.content.size;
      for (const c of cursors) {
        const pos = Math.min(c.from, docSize);
        if (pos < 0) continue;
        try {
          // Cursor widget at cursor position
          decos.push(Decoration.widget(pos, () => createCursorElement(c), { side: 1, key: c.userId }));
          // Selection highlight (nếu có range được chọn)
          if (c.from !== c.to) {
            const from = Math.min(c.from, c.to, docSize);
            const to = Math.min(Math.max(c.from, c.to), docSize);
            if (from < to) {
              decos.push(Decoration.inline(from, to, {
                style: `background-color: ${c.avatarColor}33;`, // 20% alpha
              }));
            }
          }
        } catch { }
      }
      return DecorationSet.create(state.doc, decos);
    },
  },
});

const RemoteCursorExtension = Extension.create({
  name: 'remoteCursors',
  addProseMirrorPlugins: () => [RemoteCursorPlugin],
});

// ─── FAKE SELECTION PLUGIN (ProseMirror Decoration) ─────────────────────────
// Giải pháp giữ visual selection khi editor mất focus (ví dụ: user gõ cỡ chữ).
// Khác với CSS ::selection (bị ẩn khi mất focus), Decoration thêm class vào
// các node văn bản thực trong DOM → background-color vẫn hiển dù editor không focused.
const fakeSelKey = new PluginKey<{ from: number; to: number } | null>('fakeSelection');

const FakeSelectionPlugin = new Plugin({
  key: fakeSelKey,
  state: {
    init: () => null,
    apply(tr, prev) {
      const meta = tr.getMeta(fakeSelKey);
      if (meta !== undefined) return meta; // null = clear, {from,to} = show
      if (prev && tr.docChanged) {
        // Map decoration positions khi doc thay đổi
        const from = tr.mapping.map(prev.from);
        const to = tr.mapping.map(prev.to);
        return from < to ? { from, to } : null;
      }
      return prev;
    },
  },
  props: {
    decorations(state) {
      const sel = fakeSelKey.getState(state);
      if (!sel || sel.from >= sel.to) return DecorationSet.empty;
      try {
        return DecorationSet.create(state.doc, [
          Decoration.inline(sel.from, sel.to, { class: 'fake-selection' }),
        ]);
      } catch { return DecorationSet.empty; }
    },
  },
});

const FakeSelectionExtension = Extension.create({
  name: 'fakeSelection',
  addProseMirrorPlugins: () => [FakeSelectionPlugin],
});

// ─── CUSTOM FONT-SIZE EXTENSION (extend TextStyle) ───────────────────────────
// Tiptap không có @tiptap/extension-font-size riêng, nên extend TextStyle để
// lưu fontSize dưới dạng inline style: <span style="font-size: 14pt">
const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: el => el.style.fontSize || null,
        renderHTML: attrs => {
          if (!attrs.fontSize) return {};
          return { style: `font-size: ${attrs.fontSize}` };
        },
      },
    };
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setFontSize: (size: string) => ({ chain }: any) =>
        chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }: any) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    } as any;
  },
});

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PAGE_H = 1123;
const PAGE_W = 794;
const PAD_X = 96;
const PAD_Y = 96;

const FONTS = ['Arial', 'Times New Roman', 'Calibri', 'Georgia', 'Verdana', 'Roboto', 'Courier New', 'Trebuchet MS'];

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface DocEditorProps {
  pages: any[];
  currentPageId: string | null;
  onChange: (id: string, data: any) => void;
  /** @deprecated */
  onInsertPage?: (afterPageId: string, content?: string) => void;
  /** Real-time collab */
  designId?: string;
  currentUserEmail?: string;
}
export type DocEditorHandle = {
  exportDocx: () => Promise<void>;
  exportPdf: () => void;
  flushAll: () => Map<string, string>;
};

// ─── TOOLBAR BUTTON ───────────────────────────────────────────────────────────
function ToolBtn({ title, active, onClick, disabled, children }: any) {
  return (
    <button title={title} type="button"
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold transition
        ${disabled ? 'opacity-30 cursor-not-allowed' : ''}
        ${active ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300' : 'text-slate-600 hover:bg-slate-100'}`}
    >{children}</button>
  );
}
function Sep() { return <div className="w-px h-5 bg-slate-200 mx-0.5" />; }

// ─── EXPORT DROPDOWN ────────────────────────────────────────────────────────
function ExportDropdown({ onDocx, onPdf, isExporting }: {
  onDocx: () => void; onPdf: () => void; isExporting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative mr-1">
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(o => !o)}
        disabled={isExporting}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transition shadow-sm disabled:opacity-60"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {isExporting ? 'Exporting…' : 'Export'}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-100">
          {/* DOCX */}
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setOpen(false); onDocx(); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Xuất file Word (.docx)
          </button>
          {/* PDF */}
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setOpen(false); onPdf(); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-red-50 hover:text-red-600 transition border-t border-slate-100"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <path d="M9 15v-1a2 2 0 012-2h0a2 2 0 012 2v1a2 2 0 01-2 2h0a2 2 0 01-2-2z" />
            </svg>
            Xuất file PDF
          </button>
        </div>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
const DocEditor = forwardRef<DocEditorHandle, DocEditorProps>(function DocEditor(
  { pages, currentPageId, onChange, designId, currentUserEmail }, ref
) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foreColorRef = useRef<HTMLInputElement>(null);
  const hiliteColorRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const editorRef = useRef<any>(null);
  const lastLocalEditRef = useRef<number>(0);    // timestamp của lần gõ gần nhất
  const isApplyingRemoteRef = useRef(false);      // ngăn echo loop khi setContent trigger onUpdate

  const [fontFamily, setFontFamily] = useState('Calibri');
  const [fontSize, setFontSize] = useState(12);
  const [wordCount, setWordCount] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);

  const firstDocPage = pages.find(p => p.type === 'doc') || pages[0];

  // ── Socket: join doc room, nhận cursor từ collaborator khác ──────────────────────────
  useEffect(() => {
    if (!designId) return;
    const token = localStorage.getItem('token') || '';
    const isDev = (import.meta as any).env?.DEV ?? false;
    const sock = ioConnect(isDev ? 'http://localhost:3000' : '', {
      path: '/socket.io', transports: ['websocket', 'polling'],
    });
    socketRef.current = sock;
    sock.on('connect', () => sock.emit('doc:join', { designId, token }));

    // Nhận cursor riêng (khi user click/move không kèm content change)
    sock.on('doc:cursor-moved', (data: RemoteCursor) => {
      if (data.email === currentUserEmail) return;
      setRemoteCursors(prev => [...prev.filter(c => c.userId !== data.userId), data]);
    });

    // Nhận nội dung + cursor từ collaborator khác trong 1 event (tránh race condition)
    sock.on('doc:content-changed', ({
      html, userId, email, avatarColor, cursorFrom, cursorTo,
    }: { html: string; userId: string; email: string; avatarColor: string; cursorFrom: number; cursorTo: number }) => {
      const ed = editorRef.current;
      if (!ed) return;
      // Bỏ qua nếu user vừa gõ trong vòng 150ms (tránh overwrite khi 2 người gõ đồng thời)
      if (Date.now() - lastLocalEditRef.current < 150) return;

      // Step 1: Apply content mới
      isApplyingRemoteRef.current = true; // bật flag → onUpdate sẽ không emit ngược lại
      const { from: myFrom, to: myTo } = ed.state.selection; // giữ cursor của chính mình
      ed.commands.setContent(html);
      isApplyingRemoteRef.current = false;

      // Step 2: Khôi phục cursor của mình
      try {
        const sz = ed.state.doc.content.size;
        ed.commands.setTextSelection({ from: Math.min(myFrom, sz - 1), to: Math.min(myTo, sz - 1) });
      } catch { }

      // Step 3: Cập nhật cursor của collaborator đã có content mới → vị trí đúng
      if (email !== currentUserEmail) {
        setRemoteCursors(prev => [...prev.filter(c => c.userId !== userId), {
          userId, email, avatarColor: avatarColor || '#6366f1',
          from: cursorFrom, to: cursorTo,
        }]);
      }
    });

    sock.on('doc:user-left', ({ userId }: { userId: string }) =>
      setRemoteCursors(prev => prev.filter(c => c.userId !== userId))
    );
    return () => { sock.emit('doc:leave', { designId }); sock.disconnect(); socketRef.current = null; };
  }, [designId, currentUserEmail]);

  // Sync remoteCursors → ProseMirror Decoration (addToHistory:false để không ảnh hưởng undo)
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    try { ed.view.dispatch(ed.state.tr.setMeta(remoteCursorKey, remoteCursors).setMeta('addToHistory', false)); } catch { }
  }, [remoteCursors]);

  // ── Tiptap editor ────────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      FontSize,
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
      FakeSelectionExtension,
      RemoteCursorExtension, // render cursors của collaborator khác
    ],
    content: firstDocPage?.content || '<p></p>',
    editorProps: {
      attributes: {
        class: 'doc-editor-content outline-none text-slate-800',
        // FIX INFINITE LOOP: min-height hằng số, KHÔNG phụ thuộc pageCount.
        style: `padding: ${PAD_Y}px ${PAD_X}px; font-family: Calibri, sans-serif; font-size: 12pt; line-height: 1.7; word-break: break-word; overflow-wrap: break-word; box-sizing: border-box; caret-color: #6366f1; min-height: ${PAGE_H}px; position: relative; z-index: 1;`,
        spellcheck: 'true',
      },
    },
    onUpdate({ editor }) {
      // Bỏ qua nếu đang apply remote content (tránh echo loop)
      if (isApplyingRemoteRef.current) return;

      const text = editor.getText();
      setWordCount(text.trim().split(/\s+/).filter(Boolean).length);
      const el = editor.view.dom as HTMLElement;
      setPageCount(Math.max(1, Math.ceil(el.scrollHeight / PAGE_H)));

      // Đánh dấu user vừa gõ để tránh overwrite bởi remote update
      lastLocalEditRef.current = Date.now();

      // 1) Broadcast socket NGAY LẬP TỨC: gửi HTML + cursor position cùng 1 event
      const html = editor.getHTML();
      const { from: cursorFrom, to: cursorTo } = editor.state.selection;
      if (socketRef.current?.connected && designId) {
        socketRef.current.emit('doc:content-change', { designId, html, cursorFrom, cursorTo });
      }

      // 2) DB save debounce 400ms (tránh spam API)
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const latestHtml = editor.getHTML();
        if (firstDocPage) onChange(firstDocPage.id, { content: latestHtml });
      }, 400);
    },
    // Đồng bộ toolbar khi selection thay đổi + emit cursor position tới collaborators
    onSelectionUpdate({ editor }) {
      const attrs = editor.getAttributes('textStyle');
      const ff = attrs.fontFamily || editor.getAttributes('fontFamily')?.fontFamily;
      if (ff) setFontFamily(ff.replace(/["']/g, '').split(',')[0].trim());
      const fs = attrs.fontSize;
      if (fs) {
        const num = parseFloat(fs);
        if (!isNaN(num)) setFontSize(Math.round(num));
      }
      // Emit cursor position cho các collaborator
      if (socketRef.current?.connected && designId) {
        const { from, to } = editor.state.selection;
        socketRef.current.emit('doc:cursor-move', { designId, from, to });
      }
    },
  });

  // Lưu editor vào ref để remoteCursors useEffect có thể dispatch decoration
  useEffect(() => { editorRef.current = editor; }, [editor]);

  // ── Sync content when pages change from outside ───────────────────────────
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!editor || initializedRef.current) return;
    const raw = firstDocPage?.content || '<p></p>';
    // Chỉ chạy 1 lần trước khi user gõ → undo stack chưa có gì → không ảnh hưởng
    editor.commands.setContent(raw);
    initializedRef.current = true;
  }, [editor, firstDocPage?.content]);

  // ── ResizeObserver: chỉ đọc scrollHeight (ảnh paste lớn không trigger onUpdate) ──
  // KHÔNG có bất kỳ setState nào ảnh hưởng tới kích thước DOM → không thể gây loop.
  useEffect(() => {
    if (!editor) return;
    const domEl = editor.view.dom as HTMLElement;
    const ro = new ResizeObserver(() => {
      setPageCount(Math.max(1, Math.ceil(domEl.scrollHeight / PAGE_H)));
    });
    ro.observe(domEl);
    return () => ro.disconnect();
  }, [editor]);

  // NOTE: Không còn useEffect apply font toàn cục nữa.
  // Font/size chỉ áp dụng khi user BÔI ĐEN text rồi chọn từ dropdown.
  // ── Helpers: show/hide fake selection — KHAI BÁO addToHistory:false ─────────────────
  // Nếu không có addToHistory:false, ProseMirror History ghi transaction này vào
  // undo stack, tạo "boundary" cắt đứt các history entry cũ (typing) khỏi tiếp cận được.
  const showFakeSelection = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    editor.view.dispatch(
      editor.state.tr
        .setMeta(fakeSelKey, { from, to })
        .setMeta('addToHistory', false)   // ← không ghi vào undo stack
    );
  }, [editor]);

  const hideFakeSelection = useCallback(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.state.tr
        .setMeta(fakeSelKey, null)
        .setMeta('addToHistory', false)   // ← không ghi vào undo stack
    );
  }, [editor]);


  // ── flushAll: LUÔN chỉ ghi vào pages[0] — tránh rác DB ─────────────────
  // Kiến trúc mới: 1 tài liệu = 1 trang doc duy nhất chứa toàn bộ HTML.
  // Không còn spam onInsertPage để tạo pages[1], pages[2]... rỗng nữa.
  const flushAll = useCallback((): Map<string, string> => {
    const map = new Map<string, string>();
    if (!editor || !firstDocPage) return map;
    const html = editor.getHTML();
    // Ghi toàn bộ nội dung vào trang đầu tiên
    map.set(firstDocPage.id, html);
    onChange(firstDocPage.id, { content: html });
    // Xóa content của các trang doc cũ (nếu DB còn rác từ phiên bản trước)
    pages
      .filter(p => p.id !== firstDocPage.id && (p.type === 'doc' || !p.type))
      .forEach(p => { map.set(p.id, ''); onChange(p.id, { content: '' }); });
    return map;
  }, [editor, firstDocPage, onChange, pages]);


  // ── Export DOCX (Bước 5) — đọc đúng HTML của Tiptap ────────────────────
  // Tiptap dùng: <strong>, <em>, <u>, <s>, <mark style="background-color:...">,
  // <span style="color:...; font-size:..."> thay vì tag B/I/U cũ.
  const exportDocx = useCallback(async () => {
    if (!editor) return;
    setIsExporting(true);
    try {
      const html = editor.getHTML();
      if (!editor.getText().trim()) { alert('Tài liệu trống!'); return; }

      // rgb(r,g,b) / rgba(r,g,b,a) / #rrggbb → 6-digit hex không có #
      const toHex = (c: string): string | undefined => {
        if (!c || c === 'transparent' || c === 'initial' || c === 'inherit' || c === 'auto') return undefined;
        if (c.startsWith('#')) {
          let hex = c.slice(1);
          if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
          return hex.slice(0, 6).padStart(6, '0').toLowerCase();
        }
        // Hỗ trợ cả rgb(...) và rgba(...) — Tiptap có thể output rgba
        const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return undefined;
        return [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
      };

      type RunStyle = { bold?: boolean; italics?: boolean; strike?: boolean; underline?: any; color?: string; size?: number; font?: string; shading?: any };

      // Tiptap dùng marks dạng tag hoặc span style — xử lý đệ quy
      const buildRuns = (node: HTMLElement, inherited: RunStyle = {}): TextRun[] => {
        const runs: TextRun[] = [];
        node.childNodes.forEach(child => {
          if (child.nodeType === Node.TEXT_NODE) {
            if (child.textContent) runs.push(new TextRun({ text: child.textContent, ...inherited }));
            return;
          }
          if (child.nodeType !== Node.ELEMENT_NODE) return;
          const c = child as HTMLElement;
          const tag = c.tagName.toUpperCase();
          if (tag === 'BR') { runs.push(new TextRun({ text: '', break: 1, ...inherited })); return; }

          // Tiptap marks (Merge current with inherited)
          const bold = inherited.bold || tag === 'STRONG' || c.style.fontWeight === 'bold' || c.style.fontWeight === '700';
          const italics = inherited.italics || tag === 'EM' || c.style.fontStyle === 'italic';
          const strike = inherited.strike || tag === 'S' || tag === 'DEL' || c.style.textDecoration?.includes('line-through');
          const isUnder = tag === 'U' || c.style.textDecoration?.includes('underline');
          const underline = inherited.underline || (isUnder ? { type: UnderlineType.SINGLE } : undefined);
          const color = toHex(c.style.color) || inherited.color;
          const fsPx = c.style.fontSize ? parseFloat(c.style.fontSize) : 0;
          const size = fsPx > 0 ? Math.round(fsPx * (c.style.fontSize.endsWith('pt') ? 2 : 1.5)) : inherited.size;
          const font = c.style.fontFamily ? c.style.fontFamily.replace(/["']/g, '').split(',')[0].trim() : inherited.font;

          // Highlight: CHỈ áp dụng với <mark> tag
          const shading = (tag === 'MARK'
            ? { type: ShadingType.CLEAR, color: 'auto', fill: toHex(c.getAttribute('data-color') || c.style.backgroundColor || '') || 'ffe066' }
            : inherited.shading);

          const currentStyle: RunStyle = { bold, italics, strike, underline, color, size, font, shading };

          const inner = buildRuns(c, currentStyle);
          if (inner.length > 0) {
            runs.push(...inner);
          } else {
            const text = c.innerText || c.textContent || '';
            if (text) runs.push(new TextRun({ text, ...currentStyle }));
          }
        });
        return runs;
      };

      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const allParagraphs: Paragraph[] = [];

      tmp.childNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node as HTMLElement;
        const tag = el.tagName.toUpperCase();

        // Heading level
        let heading: any;
        if (tag === 'H1') heading = HeadingLevel.HEADING_1;
        else if (tag === 'H2') heading = HeadingLevel.HEADING_2;
        else if (tag === 'H3') heading = HeadingLevel.HEADING_3;

        // Text alignment (Tiptap sinh style="text-align: center" trên thẻ p/h)
        let alignment: any = AlignmentType.LEFT;
        const ta = el.style.textAlign || el.getAttribute('data-text-align') || '';
        if (ta === 'center') alignment = AlignmentType.CENTER;
        else if (ta === 'right') alignment = AlignmentType.RIGHT;
        else if (ta === 'justify') alignment = AlignmentType.JUSTIFIED;

        const runs = buildRuns(el);
        // List items trong <ul>/<ol>: Tiptap bọc <li> bên trong
        if (tag === 'LI') {
          // docx v9 không dùng bullet property trực tiếp — dùng text prefix thay thế
          const bulletRuns = [new TextRun({ text: '• ', bold: false }), ...runs];
          allParagraphs.push(new Paragraph({ children: bulletRuns.length > 1 ? bulletRuns : [new TextRun('• ')] }));
        } else if (tag === 'UL' || tag === 'OL') {
          // Xử lý các <li> con bên trong ul/ol
          el.querySelectorAll('li').forEach(li => {
            const liRuns = buildRuns(li as HTMLElement);
            allParagraphs.push(new Paragraph({ children: [new TextRun({ text: '• ' }), ...liRuns] }));
          });
        } else {
          allParagraphs.push(new Paragraph({ heading, alignment, children: runs.length > 0 ? runs : [new TextRun('')] }));
        }
      });

      if (allParagraphs.length === 0) allParagraphs.push(new Paragraph({ children: [new TextRun('')] }));
      const doc = new Document({ sections: [{ properties: {}, children: allParagraphs }] });
      saveAs(await Packer.toBlob(doc), 'Document.docx');
    } catch (err: any) {
      console.error('DOCX export error:', err);
      alert('Lỗi xuất DOCX: ' + (err.message || err));
    }
    finally { setIsExporting(false); }
  }, [editor]);


  // ── Export PDF (dùng window.print tối ưu — KHÔNG có thời gian/header) ────────────────────────────────────────
  const exportPdf = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    const printWin = window.open('', '_blank', 'width=900,height=700');
    if (!printWin) { alert('Popup bị chặn. Cho phép popup rồi thử lại.'); return; }

    // Tạo HTML cho bản in: thêm padding cho body thay vì margin của @page để ẩn header/footer
    printWin.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Document</title>
      <style>
        /* margin: 0 giúp ẩn các thông tin header (URL, thời gian) của trình duyệt */
        @page { size: A4 portrait; margin: 0; }
        body {
          margin: 0;
          padding: 20mm; /* Padding bù lại margin để nội dung không sát mép giấy */
          font-family: Calibri, 'Times New Roman', serif;
          font-size: 12pt;
          line-height: 1.7;
          color: #000;
          box-sizing: border-box;
        }
        p { margin: 0 0 0.5em 0; }
        h1 { font-size: 2em; font-weight: 700; margin: 0.5em 0; }
        h2 { font-size: 1.5em; font-weight: 600; margin: 0.5em 0; }
        h3 { font-size: 1.17em; font-weight: 600; margin: 0.5em 0; }
        ul { list-style: disc; padding-left: 1.5em; margin: 0.5em 0; }
        ol { list-style: decimal; padding-left: 1.5em; margin: 0.5em 0; }
        a { color: #6366f1; text-decoration: underline; }
        mark { padding: 0 2px; border-radius: 2px; }
        strong { font-weight: bold; }
        em { font-style: italic; }
      </style></head>
      <body>${html}</body></html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); printWin.close(); }, 400);
  }, [editor]);

  useImperativeHandle(ref, () => ({ exportDocx, exportPdf, flushAll }), [exportDocx, exportPdf, flushAll]);

  // ── CSS pagination lines ──────────────────────────────────────────────────
  const pageLineStyle: React.CSSProperties = {
    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, transparent ${PAGE_H - 1}px, #b8c7e0 ${PAGE_H - 1}px, #b8c7e0 ${PAGE_H + 15}px, transparent ${PAGE_H + 15}px)`,
    backgroundSize: `100% ${PAGE_H + 15}px`,
  };

  if (!editor) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#e8eaed', fontFamily: 'Inter, sans-serif' }}>

      {/* ── Toolbar ── */}
      <div className="bg-white border-b border-slate-200 shadow-sm px-3 py-1.5 flex flex-wrap items-center gap-1 z-20 shrink-0">

        {/* Export dropdown đã chuyển sang nút Export góc phải (EditorTopBar) */}
        <Sep />

        {/* Font Family — chỉ áp dụng cho text được bôi đen */}
        <select value={fontFamily}
          onChange={e => {
            const f = e.target.value;
            setFontFamily(f);
            editor.chain().focus().setFontFamily(f).run();
          }}
          className="h-7 px-2 text-xs font-medium border border-slate-200 rounded bg-white text-slate-800 outline-none cursor-pointer" style={{ minWidth: 120, fontFamily }}>
          {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>

        {/* Font Size: click gõ số → Enter, hoặc bấm − + */}
        <div className="flex items-center border border-slate-200 rounded bg-white overflow-hidden h-7">
          <button type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => { const s = Math.max(6, fontSize - 1); setFontSize(s); (editor.chain().focus() as any).setFontSize(`${s}pt`).run(); }}
            className="w-5 h-full text-sm text-slate-500 hover:bg-slate-100 border-r border-slate-200 flex items-center justify-center select-none leading-none"
          >−</button>

          <input
            type="text"
            inputMode="numeric"
            value={fontSize}
            className="no-spinner w-9 h-full text-xs font-medium text-center text-slate-800 outline-none border-none bg-white px-0"
            onChange={e => {
              const s = parseInt(e.target.value);
              if (!isNaN(s)) setFontSize(Math.min(144, Math.max(6, s)));
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                hideFakeSelection();
                (editor.chain().focus() as any).setFontSize(`${fontSize}pt`).run();
              }
              if (e.key === 'Escape') { hideFakeSelection(); editor.commands.focus(); }
            }}
            onFocus={e => { showFakeSelection(); e.target.select(); }}
            onBlur={() => { hideFakeSelection(); (editor.chain().focus() as any).setFontSize(`${fontSize}pt`).run(); }}
          />

          <button type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => { const s = Math.min(144, fontSize + 1); setFontSize(s); (editor.chain().focus() as any).setFontSize(`${s}pt`).run(); }}
            className="w-5 h-full text-sm text-slate-500 hover:bg-slate-100 border-l border-slate-200 flex items-center justify-center select-none leading-none"
          >+</button>
        </div>
        <Sep />

        {/* Heading */}
        <select defaultValue="" onChange={e => { const v = e.target.value; if (v === 'p') editor.chain().focus().setParagraph().run(); else editor.chain().focus().toggleHeading({ level: parseInt(v) as any }).run(); (e.target as any).value = ''; }}
          className="h-7 px-2 text-xs font-medium border border-slate-200 rounded bg-white text-slate-800 outline-none cursor-pointer" style={{ width: 104 }}>
          <option value="" disabled>Paragraph ▾</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
          <option value="p">Normal</option>
        </select>
        <Sep />

        {/* B I U S */}
        <ToolBtn title="Bold (Ctrl+B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></ToolBtn>
        <ToolBtn title="Italic (Ctrl+I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></ToolBtn>
        <ToolBtn title="Underline (Ctrl+U)" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolBtn>
        <ToolBtn title="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></ToolBtn>
        <Sep />

        {/* Align */}
        <ToolBtn title="Align Left" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="18" y2="18" /></svg>
        </ToolBtn>
        <ToolBtn title="Center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>
        </ToolBtn>
        <ToolBtn title="Align Right" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="6" y1="18" x2="21" y2="18" /></svg>
        </ToolBtn>
        <ToolBtn title="Justify" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
        </ToolBtn>
        <Sep />

        {/* Lists */}
        <ToolBtn title="Bullet List" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="9" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="9" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1.5" fill="currentColor" /><circle cx="4" cy="12" r="1.5" fill="currentColor" /><circle cx="4" cy="18" r="1.5" fill="currentColor" /></svg>
        </ToolBtn>
        <ToolBtn title="Numbered List" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><text x="2" y="8" fontSize="7" fill="currentColor">1</text><text x="2" y="14" fontSize="7" fill="currentColor">2</text></svg>
        </ToolBtn>
        <Sep />

        {/* Indent / Outdent via keyboard hint buttons */}
        <ToolBtn title="Indent (Tab)" active={false} onClick={() => editor.chain().focus().sinkListItem('listItem').run()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6" /><polyline points="7 10 11 14 7 18" /><line x1="11" y1="14" x2="21" y2="14" /></svg>
        </ToolBtn>
        <ToolBtn title="Outdent" active={false} onClick={() => editor.chain().focus().liftListItem('listItem').run()}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6" /><polyline points="11 10 7 14 11 18" /><line x1="7" y1="14" x2="21" y2="14" /></svg>
        </ToolBtn>
        <Sep />

        {/* Text Color */}
        <div className="relative">
          <button type="button" title="Text Color"
            onMouseDown={e => e.preventDefault()}
            className="w-7 h-7 flex flex-col items-center justify-center rounded cursor-pointer hover:bg-slate-100 transition gap-0.5"
            onClick={() => foreColorRef.current?.click()}>
            <span className="text-xs font-black text-slate-700 leading-none">A</span>
            <div className="w-4 h-1 rounded-full bg-red-500" />
          </button>
          {/* onInput = preview real-time KHÔNG tạo history entry */}
          <input ref={foreColorRef} type="color" className="absolute opacity-0 w-0 h-0 pointer-events-none" tabIndex={-1}
            onInput={e => {
              const val = (e.target as HTMLInputElement).value;
              const { from, to } = editor.state.selection;
              if (from === to) return;
              const tr = editor.state.tr.addMark(
                from, to, editor.schema.marks.textStyle.create({ color: val })
              ).setMeta('addToHistory', false);
              editor.view.dispatch(tr);
            }}
            onChange={e => editor.chain().focus().setColor(e.target.value).run()} />
        </div>

        {/* Highlight */}
        <div className="relative">
          <button type="button" title="Highlight"
            onMouseDown={e => e.preventDefault()}
            className="w-7 h-7 flex flex-col items-center justify-center rounded cursor-pointer hover:bg-slate-100 transition gap-0.5"
            onClick={() => hiliteColorRef.current?.click()}>
            <span className="text-xs font-black text-slate-700 leading-none" style={{ background: '#ffe066', padding: '0 2px' }}>A</span>
            <div className="w-4 h-1 rounded-full bg-yellow-300" />
          </button>
          <input ref={hiliteColorRef} type="color" defaultValue="#ffe066" className="absolute opacity-0 w-0 h-0 pointer-events-none" tabIndex={-1}
            onInput={e => {
              const val = (e.target as HTMLInputElement).value;
              const { from, to } = editor.state.selection;
              if (from === to) return;
              const markType = editor.schema.marks.highlight;
              if (!markType) return;
              const tr = editor.state.tr.addMark(
                from, to, markType.create({ color: val })
              ).setMeta('addToHistory', false);
              editor.view.dispatch(tr);
            }}
            onChange={e => editor.chain().focus().setHighlight({ color: e.target.value }).run()} />
        </div>
        <Sep />

        {/* Undo / Redo / Clear */}
        <ToolBtn title="Undo (Ctrl+Z)" active={false}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" d="M3 10h10a7 7 0 017 7v1" /><path strokeLinecap="round" d="M3 10l4-4m-4 4l4 4" /></svg>
        </ToolBtn>
        <ToolBtn title="Redo (Ctrl+Y)" active={false}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" d="M21 10H11a7 7 0 00-7 7v1" /><path strokeLinecap="round" d="M21 10l-4-4m4 4l-4 4" /></svg>
        </ToolBtn>
        <ToolBtn title="Clear Formatting" active={false} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="20" x2="20" y2="4" stroke="#ef4444" strokeWidth="1.5" /><path strokeLinecap="round" d="M4 7h16M10 11v6M14 11v6" /></svg>
        </ToolBtn>

        <div className="ml-auto flex items-center gap-3 text-[10px] text-slate-400 font-medium">
          <span>~{pageCount} trang</span>
          <span>·</span>
          <span>{wordCount} từ</span>
        </div>
      </div>

      {/* ── Document Area ── */}
      <div className="flex-1 overflow-y-auto" style={{ background: '#e8eaed' }}>
        <div className="flex justify-center py-8 pb-20">
          {/* Paper: minHeight = pageCount * PAGE_H để trang mới hiện đầy đủ ngay.
              KHÔNG gây loop vì ResizeObserver chỉ watch editor.view.dom bên trong,
              không watch outer wrapper này. */}
          <div style={{ width: PAGE_W, minHeight: pageCount * PAGE_H, background: '#ffffff', boxShadow: '0 2px 24px rgba(0,0,0,0.15)', position: 'relative' }}>

            {/* Page break lines (CSS visual only — does NOT affect scrollHeight) */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, ...pageLineStyle }} />

            {/* Page number labels */}
            {pageCount > 1 && Array.from({ length: pageCount - 1 }).map((_, i) => (
              <div key={i} aria-hidden style={{ position: 'absolute', top: PAGE_H * (i + 1) + 3, right: 8, fontSize: 10, color: '#94a3b8', fontWeight: 600, pointerEvents: 'none', zIndex: 0, userSelect: 'none' }}>
                Trang {i + 2}
              </div>
            ))}

            {/* Tiptap editor — font/size chỉ áp dụng qua marks (selection), không áp toàn cục */}
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* ── Status Bar ── */}
      <div className="h-6 bg-[#2b579a] flex items-center px-4 gap-4 text-[10px] text-blue-100 font-medium shrink-0">
        <span>Document Mode</span><span>·</span>
        <span>{wordCount} words</span><span>·</span>
        <span>~{pageCount} pages</span><span>·</span>
        <span>A4 · 210 × 297 mm</span>
        <span className="ml-auto">KanvaPro Docs</span>
      </div>

      <style>{`
        .doc-editor-content { min-height: ${PAGE_H}px; }
        .doc-editor-content p { margin: 0 0 0.5em 0; }
        .doc-editor-content h1 { font-size: 2em; font-weight: 700; margin: 0.5em 0; }
        .doc-editor-content h2 { font-size: 1.5em; font-weight: 600; margin: 0.5em 0; }
        .doc-editor-content h3 { font-size: 1.17em; font-weight: 600; margin: 0.5em 0; }
        .doc-editor-content ul { list-style: disc; padding-left: 1.5em; margin: 0.5em 0; }
        .doc-editor-content ol { list-style: decimal; padding-left: 1.5em; margin: 0.5em 0; }
        .doc-editor-content a { color: #6366f1; text-decoration: underline; }
        .ProseMirror { outline: none; }

        /* Giữ highlight bôi đen khi editor mất focus (user click toolbar) */
        .ProseMirror ::selection,
        .ProseMirror *::selection {
          background: #b4d5fe !important;
          color: inherit;
        }
        /* Firefox */
        .ProseMirror ::-moz-selection,
        .ProseMirror *::-moz-selection {
          background: #b4d5fe !important;
          color: inherit;
        }

        /* Ẩn native spinner của input[type=number] */
        .no-spinner::-webkit-outer-spin-button,
        .no-spinner::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spinner { -moz-appearance: textfield; appearance: textfield; }

        /* FAKE SELECTION: ProseMirror Decoration inject class này vào DOM thật →
           hiển thị highlight ngay cả khi editor không có focus (user đang gõ font size) */
        .fake-selection {
          background-color: #b4d5fe !important;
          border-radius: 1px;
        }

        @media print { .doc-editor-content { box-shadow: none !important; margin: 0 !important; } }
      `}</style>
    </div>
  );
});

export default DocEditor;