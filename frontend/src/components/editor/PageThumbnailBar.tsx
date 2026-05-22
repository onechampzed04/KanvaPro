// src/components/editor/PageThumbnailBar.tsx
import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';

interface PageBarProps {
  pages: any[];
  currentPageId: string | null;
  handlePageChange: (id: string) => void;
  handleAddPage: () => void;
  deletePage: (id: string) => void;
  onReorder?: (newPages: any[]) => void;
  canEdit?: boolean;
}

// --- Sortable Slide Item ---
function SortableSlide({
  page,
  index,
  currentPageId,
  handlePageChange,
  deletePage,
  showDelete,
}: {
  page: any;
  index: number;
  currentPageId: string | null;
  handlePageChange: (id: string) => void;
  deletePage: (id: string) => void;
  showDelete: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  const isActive = currentPageId === page.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col items-center gap-1.5 shrink-0 select-none"
    >
      {/* Drag handle + click to select */}
      <button
        onClick={() => handlePageChange(page.id)}
        className={`relative w-28 h-20 bg-white shadow-sm border-2 transition-all duration-200 overflow-hidden rounded-sm group/slide ${
          isActive
            ? 'border-indigo-500 ring-2 ring-indigo-200 shadow-indigo-200'
            : 'border-transparent hover:border-slate-300 hover:shadow-md'
        } ${isDragging ? 'shadow-2xl scale-105' : ''}`}
      >
        {/* Page number badge */}
        <span className="absolute top-1 left-1 bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-70 z-10">
          {index + 1}
        </span>

        {/* Drag handle icon (appears on hover) */}
        <div
          {...attributes}
          {...listeners}
          className="absolute top-1 right-1 z-10 w-5 h-5 flex items-center justify-center bg-white/80 rounded opacity-0 group-hover/slide:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          title="Kéo để sắp xếp"
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-slate-400">
            <circle cx="2" cy="2" r="1" /><circle cx="8" cy="2" r="1" />
            <circle cx="2" cy="5" r="1" /><circle cx="8" cy="5" r="1" />
            <circle cx="2" cy="8" r="1" /><circle cx="8" cy="8" r="1" />
          </svg>
        </div>

        {/* Content preview */}
        {isActive ? (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-indigo-500 font-bold bg-indigo-50">
            Editing
          </div>
        ) : page.thumbnail ? (
          <img
            src={page.thumbnail}
            alt={`Page ${index + 1}`}
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 bg-white">
            Empty
          </div>
        )}
      </button>

      {/* Delete button */}
      {showDelete && (
        <button
          onClick={() => deletePage(page.id)}
          className="text-[10px] text-slate-400 hover:text-red-500 font-bold transition-colors px-2 py-0.5 rounded hover:bg-red-50"
        >
          Xóa
        </button>
      )}
    </div>
  );
}

// --- Ghost/Overlay item during drag ---
function DragOverlaySlide({ page, index }: { page: any; index: number }) {
  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      <div
        className="relative w-28 h-20 bg-white shadow-2xl border-2 border-indigo-400 ring-2 ring-indigo-300 overflow-hidden rounded-sm rotate-2 scale-110"
        style={{ opacity: 0.9 }}
      >
        <span className="absolute top-1 left-1 bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded z-10">
          {index + 1}
        </span>
        {page?.thumbnail ? (
          <img src={page.thumbnail} alt="" className="w-full h-full object-contain" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 bg-indigo-50 font-bold">
            Slide {index + 1}
          </div>
        )}
        {/* Ghost shimmer overlay */}
        <div className="absolute inset-0 bg-indigo-500/10" />
      </div>
    </div>
  );
}

// --- Main Component ---
export default function PageThumbnailBar({
  pages,
  currentPageId,
  handlePageChange,
  handleAddPage,
  deletePage,
  onReorder,
  canEdit = true,
}: PageBarProps) {
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }, // require 5px move to start drag
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const newIndex = pages.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(pages, oldIndex, newIndex).map((p, i) => ({
      ...p,
      page_order: i,
    }));
    onReorder?.(reordered);
  };

  const activePage = activeDragId ? pages.find((p) => p.id === activeDragId) : null;
  const activeDragIndex = activeDragId ? pages.findIndex((p) => p.id === activeDragId) : -1;

  return (
    <div className="h-32 bg-slate-100 border-t border-slate-300 flex items-center px-4 overflow-x-auto gap-3 shadow-inner">
      {canEdit ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={pages.map((p) => p.id)}
            strategy={horizontalListSortingStrategy}
          >
            {pages.map((page, index) => (
              <SortableSlide
                key={page.id}
                page={page}
                index={index}
                currentPageId={currentPageId}
                handlePageChange={handlePageChange}
                deletePage={deletePage}
                showDelete={pages.length > 1}
              />
            ))}
          </SortableContext>

          <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
            {activePage ? (
              <DragOverlaySlide page={activePage} index={activeDragIndex} />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        // Read-only: no drag
        pages.map((page, index) => (
          <div key={page.id} className="flex flex-col items-center gap-1.5 shrink-0">
            <button
              onClick={() => handlePageChange(page.id)}
              className={`relative w-28 h-20 bg-white shadow-sm border-2 transition overflow-hidden rounded-sm ${
                currentPageId === page.id
                  ? 'border-indigo-500 ring-2 ring-indigo-200'
                  : 'border-transparent hover:border-slate-300'
              }`}
            >
              <span className="absolute top-1 left-1 bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-70 z-10">
                {index + 1}
              </span>
              {page.thumbnail ? (
                <img src={page.thumbnail} alt={`Page ${index + 1}`} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">Empty</div>
              )}
            </button>
          </div>
        ))
      )}

      {/* Add Page Button */}
      {canEdit && (
        <button
          onClick={handleAddPage}
          className="shrink-0 w-12 h-20 bg-white border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 rounded flex items-center justify-center text-slate-400 hover:text-indigo-500 transition-all duration-200"
          title="Thêm trang mới"
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
    </div>
  );
}