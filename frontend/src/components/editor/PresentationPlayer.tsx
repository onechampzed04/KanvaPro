// src/components/editor/PresentationPlayer.tsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  Grid,
} from 'lucide-react';
import { Stage, Layer, Rect, Group, Line } from 'react-konva';
import { CircleShape, RectangleShape, EditableText, URLImage } from './CanvasElements';

interface PresentationPlayerProps {
  pages: any[];
  startPageId?: string;
  onClose: () => void;
}

// --- Slide Transition Variants ---
const SLIDE_VARIANTS = {
  fade: {
    enter: { opacity: 0 },
    center: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slideLeft: {
    enter: { x: '100%', opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: '-100%', opacity: 0 },
  },
  slideRight: {
    enter: { x: '-100%', opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: '100%', opacity: 0 },
  },
  zoom: {
    enter: { scale: 0.8, opacity: 0 },
    center: { scale: 1, opacity: 1 },
    exit: { scale: 1.15, opacity: 0 },
  },
  flipX: {
    enter: { rotateY: 90, opacity: 0 },
    center: { rotateY: 0, opacity: 1 },
    exit: { rotateY: -90, opacity: 0 },
  },
};

type TransitionType = keyof typeof SLIDE_VARIANTS;

function getVariant(page: any, direction: number): TransitionType {
  const t = page?.transition?.type as TransitionType | undefined;
  if (t && SLIDE_VARIANTS[t]) return t;
  if (direction > 0) return 'slideLeft';
  return 'slideRight';
}

export default function PresentationPlayer({
  pages,
  startPageId,
  onClose,
}: PresentationPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Current slide index
  const startIdx = startPageId ? Math.max(pages.findIndex((p) => p.id === startPageId), 0) : 0;
  const [[currentIdx, direction], setSlide] = useState<[number, number]>([startIdx, 0]);

  // UI State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showOverview, setShowOverview] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [autoPlayInterval, setAutoPlayIntervalState] = useState(5); // seconds
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalSlides = pages.length;

  // ── Animation state for step entry effects ──────────────────────────────────
  const [animatingStep, setAnimatingStep] = useState(-1);  // which animationOrder is currently animating
  const [animProgress, setAnimProgress] = useState(1);     // 0→1 progress of entry animation
  const animRafRef = useRef<number | null>(null);
  const animStartTimeRef = useRef<number>(0);
  const ANIM_DURATION = 600; // ms
  const currentPage = pages[currentIdx];
  
  const uniqueSteps = useMemo(() => {
    if (!currentPage?.elements) return [0];
    const steps = new Set<number>([0]);
    currentPage.elements.forEach((el: any) => {
      // Treat undefined animationOrder as 0 (appear immediately)
      // or if you want to support legacy undefined as 999, we should check AnimationPanel logic.
      // AnimationPanel defaults undefined to 999, but PresentationPlayer treated it as 0.
      // Let's keep treating it as 0 for rendering.
      if (el.animationOrder && el.animationOrder > 0) {
        steps.add(el.animationOrder);
      }
    });
    return Array.from(steps).sort((a, b) => a - b);
  }, [currentPage]);

  const maxAnimationOrder = uniqueSteps[uniqueSteps.length - 1];

  useEffect(() => {
    console.log("PresentationPlayer mounted/updated. currentStep:", currentStep, "maxAnimationOrder:", maxAnimationOrder, "elements count:", currentPage?.elements?.length);
  }, [currentStep, maxAnimationOrder, currentPage?.elements]);

  const startStepAnimation = useCallback((step: number) => {
    setAnimatingStep(step);
    setAnimProgress(0);
    animStartTimeRef.current = performance.now();
    if (animRafRef.current) cancelAnimationFrame(animRafRef.current);
    const animate = (now: number) => {
      const elapsed = now - animStartTimeRef.current;
      const progress = Math.min(1, elapsed / ANIM_DURATION);
      setAnimProgress(progress);
      if (progress < 1) {
        animRafRef.current = requestAnimationFrame(animate);
      } else {
        animRafRef.current = null;
      }
    };
    animRafRef.current = requestAnimationFrame(animate);
  }, []);

  // --- Navigation ---
  const goTo = useCallback(
    (idx: number, dir: number) => {
      if (idx < 0 || idx >= totalSlides) return;
      setSlide([idx, dir]);
      setCurrentStep(0);
      setAnimatingStep(-1);
      if (animRafRef.current) { cancelAnimationFrame(animRafRef.current); animRafRef.current = null; }
    },
    [totalSlides]
  );

  const goNext = useCallback(() => {
    const nextStepVal = uniqueSteps.find(s => s > currentStep);
    if (nextStepVal !== undefined) {
      setCurrentStep(nextStepVal);
      startStepAnimation(nextStepVal);
    } else {
      goTo(currentIdx + 1, 1);
    }
  }, [currentStep, uniqueSteps, currentIdx, goTo, startStepAnimation]);

  const goPrev = useCallback(() => {
    if (currentStep > 0) {
      const prevSteps = [...uniqueSteps].filter(s => s < currentStep);
      const prevStepVal = prevSteps.length > 0 ? prevSteps[prevSteps.length - 1] : 0;
      setCurrentStep(prevStepVal);
      setAnimatingStep(-1);
    } else {
      goTo(currentIdx - 1, -1);
    }
  }, [currentStep, uniqueSteps, currentIdx, goTo]);

  // --- Keyboard Handler ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          onClose();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, onClose]);

  // --- Fullscreen API ---
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // --- Auto-hide controls on mouse idle ---
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (!showOverview) setShowControls(false);
    }, 3000);
  }, [showOverview]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, [currentIdx]);

  // --- Auto-play ---
  useEffect(() => {
    if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current);
    if (autoPlay) {
      autoPlayTimer.current = setTimeout(() => {
        if (currentIdx < totalSlides - 1) goNext();
        else setAutoPlay(false);
      }, autoPlayInterval * 1000);
    }
    return () => {
      if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current);
    };
  }, [autoPlay, currentIdx, autoPlayInterval, goNext, totalSlides]);

  // --- Enter fullscreen on mount ---
  useEffect(() => {
    const enter = async () => {
      try {
        await containerRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } catch {
        // Fullscreen may be blocked; silently fail
      }
    };
    enter();
  }, []);

  const variantKey = getVariant(currentPage, direction);
  const variants = SLIDE_VARIANTS[variantKey];

  const renderElements = () => {
    if (!currentPage?.elements) return null;
    const stageW = currentPage.width || 1920;
    const stageH = currentPage.height || 1080;
    
    // Scale container down if window is smaller
    const scale = Math.min(
      window.innerWidth / stageW,
      window.innerHeight / stageH
    );

    const applyAnimTransform = (el: any): any => {
      let a = { ...el };
      const baseOpacity = el.opacity ?? 1;

      // Hiệu ứng Breathe lặp vô hạn (không dùng animProgress)
      if (el.animation?.in === 'breathe') {
        const breathePhase = (Date.now() / 1000) * 3;
        const scaleMod = 1 + Math.sin(breathePhase) * 0.05;
        a.scaleX = (el.scaleX || 1) * scaleMod;
        a.scaleY = (el.scaleY || 1) * scaleMod;
      }

      if (
        animatingStep >= 0 && animProgress < 1 &&
        (el.animationOrder ?? 0) === animatingStep &&
        el.animation?.in && el.animation.in !== 'none'
      ) {
        const ease = 1 - Math.pow(1 - animProgress, 3);
        
        const easeOutBack = (x: number): number => {
          const c1 = 1.70158;
          const c3 = c1 + 1;
          return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
        };
        
        const easeOutBounce = (x: number): number => {
          const n1 = 7.5625;
          const d1 = 2.75;
          if (x < 1 / d1) return n1 * x * x;
          if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
          if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
          return n1 * (x -= 2.625 / d1) * x + 0.984375;
        };

        switch (el.animation.in) {
          case 'appear':   a.opacity = animProgress > 0 ? baseOpacity : 0; break;
          case 'fade':     a.opacity = baseOpacity * ease; break;
          case 'panLeft':  a.x = el.x + 150 * (1 - ease); a.opacity = baseOpacity * ease; break;
          case 'panRight': a.x = el.x - 150 * (1 - ease); a.opacity = baseOpacity * ease; break;
          case 'panUp':    a.y = el.y + 150 * (1 - ease); a.opacity = baseOpacity * ease; break;
          case 'panDown':  a.y = el.y - 150 * (1 - ease); a.opacity = baseOpacity * ease; break;
          case 'rise':     a.y = el.y + 100 * (1 - ease); a.opacity = baseOpacity * ease; break;
          case 'wipe':     a.scaleX = (el.scaleX || 1) * ease; a.opacity = baseOpacity * ease; break;
          case 'pop': {
            const popEase = easeOutBack(animProgress);
            a.scaleX = (el.scaleX || 1) * popEase;
            a.scaleY = (el.scaleY || 1) * popEase;
            a.opacity = animProgress > 0 ? baseOpacity : 0;
            break;
          }
          case 'tumble':
            a.rotation = (el.rotation || 0) - 720 * (1 - ease);
            a.x = el.x - 200 * (1 - ease);
            a.opacity = baseOpacity * ease;
            break;
          case 'neon':
            a.opacity = Math.random() > 0.5 ? baseOpacity : baseOpacity * 0.2;
            break;
          case 'scrapbook': {
            const steps = 6;
            const steppedProgress = Math.floor(animProgress * steps) / steps;
            a.scaleX = (el.scaleX || 1) * steppedProgress;
            a.scaleY = (el.scaleY || 1) * steppedProgress;
            a.rotation = (el.rotation || 0) + (Math.random() - 0.5) * 20 * (1 - steppedProgress);
            a.opacity = baseOpacity * steppedProgress;
            break;
          }
          case 'stomp': {
            const stompEase = Math.min(1, animProgress * 4);
            a.scaleX = (el.scaleX || 1) * (1 + 2 * (1 - stompEase));
            a.scaleY = (el.scaleY || 1) * (1 + 2 * (1 - stompEase));
            a.opacity = baseOpacity * stompEase;
            break;
          }
          case 'bounce': {
            const bounceEase = easeOutBounce(animProgress);
            a.y = el.y - 150 * (1 - bounceEase);
            a.opacity = animProgress > 0 ? baseOpacity : 0;
            break;
          }
          // Các hiệu ứng cũ
          case 'flyIn':    a.y = el.y + (1 - ease) * 200; a.opacity = baseOpacity * ease; break;
          case 'floatIn':  a.y = el.y + (1 - ease) * 50;  a.opacity = baseOpacity * ease; break;
          case 'zoom':     a.scaleX = (el.scaleX || 1) * ease; a.scaleY = (el.scaleY || 1) * ease; a.opacity = baseOpacity * ease; break;
          case 'growAndTurn': a.scaleX = (el.scaleX||1)*ease; a.scaleY = (el.scaleY||1)*ease; a.rotation = (el.rotation||0) - 90*(1-ease); a.opacity = baseOpacity*ease; break;
          case 'swivel':   a.scaleX = (el.scaleX || 1) * Math.cos((1 - ease) * Math.PI / 2); break;
          default:         if (el.animation.in !== 'breathe') a.opacity = baseOpacity * ease; break;
        }
      } else if (animatingStep >= 0 && animProgress < 1 && (el.animationOrder ?? 0) > animatingStep) {
         // Hide future elements entirely if we are currently animating a prior step
         a.opacity = 0;
      }
      return a;
    };

    const visibleElements = currentPage.elements
      .filter((el: any) => (el.animationOrder || 0) <= currentStep)
      .map(applyAnimTransform);

    return (
      <div 
        style={{
          width: stageW * scale,
          height: stageH * scale,
          boxShadow: '0 0 80px rgba(0,0,0,0.6)',
          backgroundColor: currentPage.background_color || '#ffffff',
        }}
      >
        <Stage width={stageW * scale} height={stageH * scale} scaleX={scale} scaleY={scale}>
          <Layer>
            <Group>
              {visibleElements.map((el: any) => {
                const shapeProps = { ...el, listening: false };
                const handlers = { onChange: () => {}, onChangeFinal: () => {}, onSelect: () => {}, onDragMove: () => {} };
                if (el.type === 'circle') return <CircleShape key={el.id} shape={shapeProps} {...handlers} />;
                if (el.type === 'rect' || el.type === 'shape') return <RectangleShape key={el.id} shape={shapeProps} {...handlers} />;
                if (el.type === 'line') {
                  return (
                    <Line
                      key={el.id}
                      id={el.id}
                      points={shapeProps.points}
                      stroke={shapeProps.stroke || '#6366f1'}
                      strokeWidth={shapeProps.strokeWidth || 3}
                      hitStrokeWidth={20}
                      tension={shapeProps.tension || 0}
                      lineCap={shapeProps.lineCap || 'round'}
                      lineJoin={shapeProps.lineJoin || 'round'}
                      x={shapeProps.x || 0}
                      y={shapeProps.y || 0}
                      opacity={shapeProps.opacity ?? 1}
                      scaleX={shapeProps.scaleX ?? 1}
                      scaleY={shapeProps.scaleY ?? 1}
                      rotation={shapeProps.rotation ?? 0}
                      listening={false}
                    />
                  );
                }
                if (el.type === 'text') return <EditableText key={el.id} text={shapeProps} isEditing={false} {...handlers} />;
                if (el.type === 'image') return <URLImage key={el.id} image={shapeProps} {...handlers} />;
                return null;
              })}
            </Group>
          </Layer>
        </Stage>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center cursor-pointer"
      onMouseMove={resetHideTimer}
      onClick={() => {
        resetHideTimer();
        goNext();
      }}
      style={{ cursor: showControls ? 'default' : 'none' }}
    >
      {/* ── SLIDE AREA ── */}
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentPage?.id ?? currentIdx}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ perspective: 1200 }}
          >
            {/* Slide Content */}
            {currentPage?.elements && currentPage.elements.length > 0 ? (
              renderElements()
            ) : currentPage?.thumbnail ? (
              <img
                src={currentPage.thumbnail}
                alt={`Slide ${currentIdx + 1}`}
                className="max-w-full max-h-full object-contain"
                style={{
                  aspectRatio: `${currentPage.width || 1920} / ${currentPage.height || 1080}`,
                  maxWidth: '100vw',
                  maxHeight: '100vh',
                  boxShadow: '0 0 80px rgba(0,0,0,0.6)',
                }}
              />
            ) : (
              <div
                className="bg-white flex items-center justify-center text-slate-400 text-2xl font-bold"
                style={{
                  width: `min(100vw, calc(100vh * ${(currentPage?.width || 1920) / (currentPage?.height || 1080)}))`,
                  height: `min(100vh, calc(100vw * ${(currentPage?.height || 1080) / (currentPage?.width || 1920)}))`,
                  boxShadow: '0 0 80px rgba(0,0,0,0.6)',
                }}
              >
                Slide {currentIdx + 1}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── PREV ARROW ── */}
      <AnimatePresence>
        {showControls && currentIdx > 0 && (
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="absolute left-6 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all hover:scale-110"
          >
            <ChevronLeft size={26} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── NEXT ARROW ── */}
      <AnimatePresence>
        {showControls && currentIdx < totalSlides - 1 && (
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="absolute right-6 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all hover:scale-110"
          >
            <ChevronRight size={26} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── GLASSMORPHISM CONTROL BAR ── */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.25 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30"
          >
            <div
              className="flex items-center gap-4 px-6 py-3 rounded-2xl"
              style={{
                background: 'rgba(15, 15, 25, 0.55)',
                backdropFilter: 'blur(24px) saturate(180%)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
            >
              {/* Close */}
              <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                title="Thoát (Esc)"
                className="w-8 h-8 flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all"
              >
                <X size={16} />
              </button>

              <div className="w-px h-5 bg-white/15" />

              {/* Prev */}
              <button
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                disabled={currentIdx === 0}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
              >
                <ChevronLeft size={18} />
              </button>

              {/* Slide counter */}
              <span className="text-white font-bold text-sm min-w-[60px] text-center tabular-nums">
                {currentIdx + 1} / {totalSlides}
              </span>

              {/* Next */}
              <button
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                disabled={currentIdx === totalSlides - 1}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
              >
                <ChevronRight size={18} />
              </button>

              <div className="w-px h-5 bg-white/15" />

              {/* Auto-play toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); setAutoPlay((v) => !v); }}
                title={autoPlay ? 'Dừng tự động' : 'Tự động chuyển slide'}
                className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all ${autoPlay ? 'text-indigo-400 bg-indigo-500/20' : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
              >
                {autoPlay ? <Pause size={16} /> : <Play size={16} />}
              </button>

              {/* Overview grid */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowOverview((v) => !v); }}
                title="Tổng quan"
                className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all ${showOverview ? 'text-sky-400 bg-sky-500/20' : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
              >
                <Grid size={16} />
              </button>

              {/* Fullscreen toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                title={isFullscreen ? 'Thoát toàn màn hình (F)' : 'Toàn màn hình (F)'}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all"
              >
                {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>

            {/* Progress bar */}
            <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-indigo-500 to-sky-400 rounded-full"
                animate={{ width: `${((currentIdx + 1) / totalSlides) * 100}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SLIDE OVERVIEW PANEL ── */}
      <AnimatePresence>
        {showOverview && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-x-0 bottom-0 z-40 max-h-[45vh] overflow-y-auto"
            style={{
              background: 'rgba(10, 10, 20, 0.85)',
              backdropFilter: 'blur(20px)',
              borderTop: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div className="p-6 flex flex-wrap gap-3 justify-center">
              {pages.map((page, idx) => (
                <button
                  key={page.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    goTo(idx, idx > currentIdx ? 1 : -1);
                    setShowOverview(false);
                  }}
                  className={`relative flex-shrink-0 rounded-lg overflow-hidden transition-all ${idx === currentIdx
                      ? 'ring-2 ring-indigo-400 scale-105'
                      : 'ring-1 ring-white/10 hover:ring-white/30 hover:scale-105 opacity-60 hover:opacity-100'
                    }`}
                  style={{ width: 120, height: 68 }}
                >
                  <span className="absolute top-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded z-10">
                    {idx + 1}
                  </span>
                  {page.thumbnail ? (
                    <img src={page.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-slate-700 flex items-center justify-center text-white/40 text-xs">
                      Slide {idx + 1}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide number tooltip (top-right) */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-5 right-6 z-30 text-white/50 text-xs font-bold tabular-nums"
          >
            {currentIdx + 1} / {totalSlides}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
