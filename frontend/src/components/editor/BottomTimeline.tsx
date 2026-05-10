// src/components/editor/BottomTimeline.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Maximize2, Minimize2, Music, ZoomIn, Plus, Type, Image as ImageIcon, Zap } from 'lucide-react';

export default function BottomTimeline(props: any) {
  const { pages, pageTimings, totalDuration, currentPageId, elements, handlePageChange, handleAddPage, deletePage, reorderPages, updateElement, updatePage, designType, selectedIds, setSelectedIds, isPlaying, setIsPlaying, currentTime, setCurrentTime } = props;

  const [viewMode, setViewMode] = useState<'thumbnail' | 'timeline'>('thumbnail');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [timelineHeight, setTimelineHeight] = useState(288); // 72 * 4 = 288px default cho h-72
  const containerRef = useRef<HTMLDivElement>(null);

  const PIXELS_PER_SECOND = 40 * zoomLevel;
  const LANE_HEIGHT = 28; // px per lane row

  const renderTimelineThumbnail = (el: any) => {
    if (el.type === 'image' || el.type === 'sticker') {
      return <img src={el.src} className="w-4 h-4 object-cover rounded-sm shrink-0" />;
    }
    if (el.type === 'text') {
      return <Type size={10} className="shrink-0 text-white/80" />;
    }
    if (el.type === 'circle') {
      return <div className="w-3 h-3 rounded-full shrink-0 border border-white/40" style={{ backgroundColor: el.fill || '#94a3b8' }} />;
    }
    if (el.type === 'rect' || el.type === 'shape') {
      return <div className="w-3 h-3 rounded-[2px] shrink-0 border border-white/40" style={{ backgroundColor: el.fill || '#94a3b8' }} />;
    }
    return <ImageIcon size={10} className="shrink-0 text-white/50" />;
  };

  // --- LOGIC KÉO THẢ TRANG Ở CHẾ ĐỘ NORMAL ---
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx !== null && draggedIdx !== index && reorderPages) {
      reorderPages(draggedIdx, index);
    }
    setDraggedIdx(null);
  };

  // --- 1. CHẠY PLAYBACK ---
  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();
    const playLoop = (time: number) => {
      if (!isPlaying) return;
      const delta = (time - lastTime) / 1000;
      lastTime = time;
      setCurrentTime((prev: number) => {
        const next = prev + delta;
        if (next >= totalDuration) { setIsPlaying(false); return 0; }
        return next;
      });
      frameId = requestAnimationFrame(playLoop);
    };
    if (isPlaying) frameId = requestAnimationFrame(playLoop);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, totalDuration]);

  // --- 2. KÉO THANH THỜI GIAN (SCRUBBER) ---
  const handleScrubberDrag = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const updateTime = (event: PointerEvent) => {
      if (!containerRef.current) return;
      const bounds = containerRef.current.getBoundingClientRect();
      let newTime = ((event.clientX - bounds.left) + containerRef.current.scrollLeft) / PIXELS_PER_SECOND;
      setCurrentTime(Math.max(0, Math.min(totalDuration, newTime)));
    };

    updateTime(e.nativeEvent);

    const onMove = (e: PointerEvent) => updateTime(e);
    const onUp = (e: PointerEvent) => {
      target.releasePointerCapture(e.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // --- 3. KÉO THẢ ELEMENT ---
  const [dragInfo, setDragInfo] = useState<any>(null);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, text: '' });

  const handleElementPointerDown = (e: React.PointerEvent, id: string, type: 'move' | 'resizeL' | 'resizeR', el: any, pageStart: number, pageEnd: number, index: number) => {
    e.stopPropagation();
    setSelectedIds([id]);
    const initLane = el.timeline?.lane !== undefined ? el.timeline.lane : index;
    setDragInfo({ id, type, startX: e.clientX, startY: e.clientY, initStart: el.timeline?.start || 0, initDuration: el.timeline?.duration || 5, initLane, pageStart, pageEnd });
  };

  const handleElementPointerMove = (e: React.PointerEvent) => {
    if (!dragInfo) return;
    const deltaSeconds = (e.clientX - dragInfo.startX) / PIXELS_PER_SECOND;

    let newStart = dragInfo.initStart;
    let newDuration = dragInfo.initDuration;
    let newLane = dragInfo.initLane;

    if (dragInfo.type === 'move') {
      const deltaY = e.clientY - dragInfo.startY;
      // Since lanes are stacked from bottom to top, dragging UP (negative deltaY) means INCREASING lane index.
      newLane = Math.max(0, dragInfo.initLane - Math.round(deltaY / LANE_HEIGHT));
    }

    const maxLocalDuration = dragInfo.pageEnd - dragInfo.pageStart;
    if (dragInfo.type === 'move') {
      newStart = Math.max(0, Math.min(maxLocalDuration - newDuration, dragInfo.initStart + deltaSeconds));
    } else if (dragInfo.type === 'resizeR') {
      newDuration = Math.max(0.5, Math.min(maxLocalDuration - newStart, dragInfo.initDuration + deltaSeconds));
    } else if (dragInfo.type === 'resizeL') {
      const moveAmount = Math.max(-dragInfo.initStart, Math.min(dragInfo.initDuration - 0.5, deltaSeconds));
      newStart = dragInfo.initStart + moveAmount;
      newDuration = dragInfo.initDuration - moveAmount;
    }

    const el = elements.find((e: any) => e.id === dragInfo.id);
    if (el) updateElement({ ...el, timeline: { ...el.timeline, start: newStart, duration: newDuration, lane: newLane } });
    setTooltip({ visible: true, x: e.clientX + 10, y: e.clientY - 30, text: `${newStart.toFixed(1)}s -> ${(newStart + newDuration).toFixed(1)}s` });
  };

  const handleElementPointerUp = () => { if (dragInfo) { setDragInfo(null); setTooltip({ visible: false, x: 0, y: 0, text: '' }); } };

  // --- 3.5. KÉO THAY ĐỔI DURATION CỦA PAGE ---
  const [pageDragInfo, setPageDragInfo] = useState<any>(null);

  const handlePagePointerDown = (e: React.PointerEvent, pageId: string, initDuration: number) => {
    e.stopPropagation();
    setPageDragInfo({ id: pageId, startX: e.clientX, initDuration });
  };

  const handlePagePointerMove = (e: React.PointerEvent) => {
    if (!pageDragInfo) return;
    const deltaSeconds = (e.clientX - pageDragInfo.startX) / PIXELS_PER_SECOND;
    const newDuration = Math.max(0.5, pageDragInfo.initDuration + deltaSeconds);
    if (updatePage) {
       updatePage(pageDragInfo.id, { duration: newDuration });
    }
  };

  const handlePagePointerUp = () => { if (pageDragInfo) setPageDragInfo(null); };

  // --- 4. KÉO THAY ĐỔI CHIỀU CAO TIMELINE ---
  const handleTimelineResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = timelineHeight;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      // Kéo lên trên -> deltaY âm -> chiều cao tăng lên
      const newHeight = Math.max(150, Math.min(800, startHeight - deltaY));
      setTimelineHeight(newHeight);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <div
      className={`border-t flex flex-col shadow-sm backdrop-blur-xl relative ${viewMode === 'timeline' ? 'bg-white/90 border-white/60' : 'h-36 bg-white/70 border-white/60 transition-all duration-300'}`}
      style={viewMode === 'timeline' ? { height: `${timelineHeight}px` } : {}}
    >
      {viewMode === 'timeline' && (
        <div
          className="absolute -top-1.5 left-0 right-0 h-3 cursor-ns-resize hover:bg-indigo-500/20 active:bg-indigo-500/40 transition-colors z-[100] flex justify-center items-center group"
          onPointerDown={handleTimelineResize}
        >
          <div className="w-16 h-1 rounded-full bg-slate-300 group-hover:bg-indigo-500 transition-colors" />
        </div>
      )}

      {tooltip.visible && <div style={{ left: tooltip.x, top: tooltip.y }} className="fixed z-50 bg-black text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg pointer-events-none">{tooltip.text}</div>}

      {/* TOP CONTROLS (Thanh menu đổi màu theo Mode) */}
      <div className={`h-10 border-b flex items-center justify-between px-4 shrink-0 transition-colors ${viewMode === 'timeline' ? 'bg-slate-50/80 border-slate-200' : 'bg-white/50 border-white/40'}`}>
        <div className="flex items-center gap-4 text-slate-700">
          <button onClick={() => { setIsPlaying(!isPlaying); if (currentTime >= totalDuration) setCurrentTime(0); }} className="hover:text-indigo-500 transition w-6 flex justify-center">
            {isPlaying ? <Pause size={16} /> : <Play size={16} className="fill-current" />}
          </button>
          <span className="text-xs font-bold font-mono tracking-wider w-16 opacity-80">00:{(Number(currentTime) || 0).toFixed(1).padStart(4, '0')}</span>
          {viewMode === 'timeline' && (
            <div className="flex items-center gap-2 ml-4">
              <ZoomIn size={14} className="text-slate-400" />
              <input type="range" min="0.5" max="3" step="0.1" value={zoomLevel} onChange={e => setZoomLevel(Number(e.target.value))} className="w-24 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
            </div>
          )}
        </div>

        {/* Nút bật/tắt Timeline chỉ dành cho Presentation/Video */}
        {(designType === 'presentation' || designType === 'video') && (
          <button onClick={() => setViewMode(viewMode === 'thumbnail' ? 'timeline' : 'thumbnail')} className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded transition ${viewMode === 'timeline' ? 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700' : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 shadow-sm'}`}>
            {viewMode === 'thumbnail' ? <><Maximize2 size={12} /> Timeline Mode</> : <><Minimize2 size={12} /> Normal Mode</>}
          </button>
        )}
      </div>

      {/* CHẾ ĐỘ 1: NORMAL MODE (Thumbnails sáng sủa, kéo thả giống Canva tĩnh) */}
      {viewMode === 'thumbnail' && (
        <div className="flex-1 flex items-center px-6 overflow-x-auto gap-4 py-2 custom-scrollbar">
          {pages.map((page: any, index: number) => {
            const isActive = currentPageId === page.id;

            // Kiểm tra xem trang TIẾP THEO có đang cài transition không
            const nextTransition = index < pages.length - 1 ? pages[index + 1].transition?.type : null;
            const hasTransition = nextTransition && nextTransition !== 'none';

            return (
              <React.Fragment key={page.id}>
                {/* 1. KHỐI HIỂN THỊ THUMBNAIL PAGE */}
                <div
                  className="flex flex-col items-center gap-2 shrink-0 relative group"
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                >
                  <button
                    onClick={() => handlePageChange(page.id)}
                    className={`relative w-32 h-20 bg-white shadow-sm border-2 transition overflow-hidden rounded-md ${isActive ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-transparent hover:border-slate-400'
                      } ${draggedIdx === index ? 'opacity-50' : 'opacity-100'}`}
                  >
                    <span className="absolute top-1 left-1 bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-70 z-10">{index + 1}</span>
                    {page.thumbnail ? (
                      <img src={page.thumbnail} alt={`Page ${index + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 font-medium">Empty Page</div>
                    )}
                    {(designType === 'presentation' || designType === 'video') && (
                      <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[8px] font-bold px-1 rounded">{page.duration || 5}s</span>
                    )}
                  </button>
                  {pages.length > 1 && deletePage && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deletePage(page.id); }}
                      className="absolute -top-2 -right-2 bg-white text-red-500 rounded-full shadow border border-slate-200 p-1 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                  )}
                </div>

                {/* 🔥 2. KHỐI CHUYỂN CẢNH: THANH DỌC VÀ DẤU (+) ĐÃ ĐƯỢC FIX LỖI HIỂN THỊ */}
                {index < pages.length - 1 && (
                  <div
                    className="relative flex items-center justify-center w-6 h-20 shrink-0 group cursor-pointer"
                    onClick={() => props.onOpenTransition(pages[index + 1].id)}
                  >
                    {/* Thanh dọc ẩn đi, chỉ hiện khi có hiệu ứng hoặc di chuột vào */}
                    <div className={`absolute top-1/2 -translate-y-1/2 w-1.5 h-10 rounded-full transition-all duration-300 ${hasTransition ? 'bg-indigo-400 opacity-100' : 'bg-slate-300 opacity-0 group-hover:opacity-100'}`} />

                    {/* Nút chọn (+) */}
                    <button
                      className={`absolute z-10 w-6 h-6 border rounded-full flex items-center justify-center transition-all shadow-sm ${hasTransition ? 'bg-indigo-50 border-indigo-400 text-indigo-600 opacity-100' : 'bg-white border-slate-300 text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-400'}`}
                    >
                      {hasTransition ? (
                        <div className="w-2.5 h-2.5 border-2 border-indigo-600 border-t-transparent border-l-transparent rotate-45 -translate-x-[1px] -translate-y-[1px]" />
                      ) : (
                        <Plus size={14} />
                      )}
                    </button>
                  </div>
                )}
              </React.Fragment>
            );
          })}

          <button onClick={handleAddPage} className="shrink-0 w-16 h-20 bg-white border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-600 rounded-md flex items-center justify-center text-slate-400 transition">
            <Plus size={24} />
          </button>
        </div>
      )}

      {/* CHẾ ĐỘ 2: TIMELINE MODE (Edit Video chuyên nghiệp) */}
      {viewMode === 'timeline' && (
        <div ref={containerRef} className="flex-1 overflow-auto bg-slate-50 relative select-none" onPointerMove={(e) => { handleElementPointerMove(e); handlePagePointerMove(e); }} onPointerUp={() => { handleElementPointerUp(); handlePagePointerUp(); }} onPointerLeave={() => { handleElementPointerUp(); handlePagePointerUp(); }}>

          <div style={{ width: `${totalDuration * PIXELS_PER_SECOND}px`, minWidth: '100%' }} className="relative h-full">

            {/* THƯỚC ĐO THỜI GIAN (RULER) - KÉO ĐỂ SEEK */}
            <div className="h-6 sticky top-0 bg-white/90 z-30 flex text-[10px] text-slate-500 font-mono cursor-ew-resize border-b border-slate-200" onPointerDown={handleScrubberDrag}>
              {Array.from({ length: Math.ceil(totalDuration) }).map((_, i) => (
                <div key={i} className="border-l border-slate-300 h-2 mt-auto px-1" style={{ width: `${PIXELS_PER_SECOND}px`, position: 'absolute', left: `${i * PIXELS_PER_SECOND}px` }}>{i}s</div>
              ))}
            </div>

            {/* KIM CHỈ THỜI GIAN ĐỎ (SCRUBBER) */}
            <div className="absolute top-0 bottom-0 w-[1px] bg-red-500 z-40 pointer-events-none transition-transform duration-75 ease-linear" style={{ transform: `translateX(${currentTime * PIXELS_PER_SECOND}px)` }}>
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full -translate-x-[4px] -translate-y-1" />
            </div>

            {/* HÀNG 1: ELEMENTS CỦA TOÀN BỘ CÁC TRANG */}
            <div className="relative overflow-y-auto max-h-64 custom-scrollbar border-b border-slate-800">
              {(() => {
                let maxLane = 0;
                pages.forEach((p: any) => {
                  const pEls = p.id === currentPageId ? elements : (p.elements || []);
                  pEls.forEach((el: any, idx: number) => {
                    const l = el.timeline?.lane !== undefined ? el.timeline.lane : idx;
                    if (l > maxLane) maxLane = l;
                  });
                });
                const containerHeight = Math.max(96, (maxLane + 1) * LANE_HEIGHT + 8);

                return (
                  <div
                    className="relative"
                    style={{ height: `${containerHeight}px` }}
                  >
                {pages.map((page: any) => {
                  const pTiming = pageTimings.find((pt: any) => pt.id === page.id);
                  if (!pTiming) return null;

                  const liveElements = page.id === currentPageId ? elements : (page.elements || []);

                  return liveElements.map((el: any, index: number) => {
                    const startOffset = pTiming.start + (el.timeline?.start || 0);
                    const duration = el.timeline?.duration || 5;
                    const laneIndex = el.timeline?.lane !== undefined ? el.timeline.lane : index;

                    let bgColor = 'bg-indigo-500';
                    if (el.type === 'image' || el.type === 'sticker') bgColor = 'bg-purple-500';
                    if (el.type === 'rect' || el.type === 'circle') bgColor = 'bg-emerald-500';

                    return (
                      <div
                        key={el.id}
                        className={`absolute h-5 rounded text-[9px] text-white flex items-center shadow cursor-grab active:cursor-grabbing ${selectedIds.includes(el.id) ? 'ring-2 ring-white z-20' : 'opacity-80 z-10'} ${bgColor}`}
                        style={{
                          left: `${startOffset * PIXELS_PER_SECOND}px`,
                          width: `${duration * PIXELS_PER_SECOND}px`,
                          bottom: `${4 + (laneIndex * LANE_HEIGHT)}px`
                        }}
                        onPointerDown={(e) => {
                          if (page.id !== currentPageId) { handlePageChange(page.id); return; }
                          handleElementPointerDown(e, el.id, 'move', el, pTiming.start, pTiming.end, index);
                        }}
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/20 hover:bg-white/50" onPointerDown={(e) => { if (page.id === currentPageId) handleElementPointerDown(e, el.id, 'resizeL', el, pTiming.start, pTiming.end, index); }} />
                        <div className="flex items-center gap-1 px-1.5 truncate pointer-events-none">
                          {el.animation?.in && el.animation.in !== 'none' && <Zap size={8} className="text-amber-300 fill-amber-300 shrink-0" />}
                          {renderTimelineThumbnail(el)}
                          <span className="truncate text-[8px]">{el.text || el.type.toUpperCase()}</span>
                        </div>
                        {/* Animation badges — shown only if animation is set */}
                        <div className="absolute right-3 top-0 bottom-0 flex items-center gap-0.5 pointer-events-none">
                          {el.animation?.in && el.animation.in !== 'none' && (
                            <span className="text-[7px] font-extrabold bg-amber-400/80 text-amber-900 px-1 rounded">
                              IN:{el.animation.in.toUpperCase().slice(0, 4)}
                            </span>
                          )}
                          {el.animation?.out && el.animation.out !== 'none' && (
                            <span className="text-[7px] font-extrabold bg-rose-400/80 text-rose-900 px-1 rounded">
                              OUT:{el.animation.out.toUpperCase().slice(0, 4)}
                            </span>
                          )}
                        </div>
                        <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/20 hover:bg-white/50" onPointerDown={(e) => { if (page.id === currentPageId) handleElementPointerDown(e, el.id, 'resizeR', el, pTiming.start, pTiming.end, index); }} />
                      </div>
                    );
                  });
                })}
              </div>
              );
              })()}
            </div>

            {/* HÀNG 2: THUMBNAIL (SLIDES) */}
            <div className="relative h-16 flex items-center border-b border-slate-200 bg-slate-100">
              {pages.map((page: any, idx: number) => {
                const pTiming = pageTimings.find((pt: any) => pt.id === page.id);
                if (!pTiming) return null;
                const isActive = page.id === currentPageId;

                return (
                  <div key={page.id}
                    className={`absolute h-12 top-2 rounded bg-slate-800 overflow-hidden cursor-pointer transition ${isActive ? 'border-2 border-indigo-500 ring-2 ring-indigo-500/50 opacity-100 z-10' : 'border border-slate-600 opacity-50 hover:opacity-100 z-0'}`}
                    style={{ left: `${pTiming.start * PIXELS_PER_SECOND}px`, width: `${pTiming.duration * PIXELS_PER_SECOND}px` }}
                    onClick={() => handlePageChange(page.id)}>
                    {page.thumbnail ? (
                      <img src={page.thumbnail} className="w-full h-full object-cover pointer-events-none" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 font-bold bg-white pointer-events-none">Page {idx + 1}</div>
                    )}
                    <span className="absolute bottom-0 left-1 text-[8px] font-bold text-white bg-black/50 px-1 pointer-events-none">{idx + 1}</span>
                    <span className="absolute top-1 left-1 text-[8px] font-bold text-white bg-black/50 px-1 pointer-events-none">{Number(page.duration || 5).toFixed(1)}s</span>
                    
                    {/* Resize Right Handle */}
                    <div 
                      className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize bg-white/10 hover:bg-white/40 flex items-center justify-center"
                      onPointerDown={(e) => handlePagePointerDown(e, page.id, Number(page.duration || 5))}
                    >
                      <div className="w-0.5 h-4 bg-white/80 rounded-full pointer-events-none"></div>
                    </div>
                  </div>
                );
              })}
              <div className="absolute h-12 top-2 ml-2" style={{ left: `${totalDuration * PIXELS_PER_SECOND}px` }}>
                <button onClick={handleAddPage} className="w-8 h-full bg-white hover:bg-indigo-50 hover:text-indigo-600 rounded border border-slate-300 flex items-center justify-center text-slate-400 transition shadow-sm"><Plus size={14} /></button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}