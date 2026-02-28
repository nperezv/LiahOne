import { useEffect, useMemo, useRef, useState, type PointerEvent, type TouchEvent } from "react";
import { ScanLine } from "lucide-react";

export type GaugeSegment = {
  label: string;
  value: number;
  color: string;
  count?: number;
};

interface InventoryGaugeProps {
  total: number;
  segments: GaugeSegment[];
}

const GAUGE_SIZE = 220;
const STROKE_WIDTH = 22;
const SWEEP_ANGLE = 300;
const SEGMENT_GAP = 8;

export function InventoryGauge({ total, segments }: InventoryGaugeProps) {
  const radius = (GAUGE_SIZE - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (SWEEP_ANGLE / 360) * circumference;
  const chartSegments = segments.slice(0, 6);

  const normalizedSegments = chartSegments.map((segment) => {
    const normalizedValue = Math.max(0, Math.min(100, Number(segment.value) || 0));
    return { ...segment, value: normalizedValue };
  });

  const totalPercent = normalizedSegments.reduce((sum, segment) => sum + segment.value, 0);
  const gapSize = normalizedSegments.length > 1 ? SEGMENT_GAP : 0;
  const availableArc = Math.max(0, arcLength - gapSize * Math.max(0, normalizedSegments.length - 1));

  const slides = useMemo(() => {
    const categorySlides = normalizedSegments.map((segment) => ({
      key: segment.label,
      title: segment.label,
      value: segment.count ?? 0,
      subtitle: "activos",
      color: segment.color,
    }));

    return [
      {
        key: "total",
        title: "Total",
        value: total,
        subtitle: "activos",
        color: "hsl(var(--foreground))",
      },
      ...categorySlides,
    ];
  }, [normalizedSegments, total]);

  const [activeSlide, setActiveSlide] = useState(0);
  const [animatedValue, setAnimatedValue] = useState(total);
  const startX = useRef<number | null>(null);
  const pointerStartX = useRef<number | null>(null);

  const goToSlide = (nextIndex: number) => {
    const boundedIndex = Math.max(0, Math.min(nextIndex, slides.length - 1));
    setActiveSlide(boundedIndex);
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    startX.current = event.touches[0]?.clientX ?? null;
  };

  const handleSwipe = (fromX: number | null, toX: number | null) => {
    if (fromX == null || toX == null) return;
    const delta = fromX - toX;
    if (Math.abs(delta) < 35) return;
    goToSlide(activeSlide + (delta > 0 ? 1 : -1));
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    handleSwipe(startX.current, event.changedTouches[0]?.clientX ?? null);
    startX.current = null;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerStartX.current = event.clientX ?? null;
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    handleSwipe(pointerStartX.current, typeof event.clientX === "number" ? event.clientX : null);
    pointerStartX.current = null;
  };

  const currentSlide = slides[activeSlide] ?? slides[0];

  useEffect(() => {
    let frameId = 0;
    const startValue = animatedValue;
    const endValue = currentSlide?.value ?? 0;
    const duration = 420;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const nextValue = startValue + (endValue - startValue) * easedProgress;
      setAnimatedValue(Math.round(nextValue));

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [activeSlide, currentSlide?.value]);

  let consumedArc = 0;

  return (
    <div className="space-y-4">
      <div className="relative mx-auto w-fit" data-testid="inventory-gauge">
        <div className="pointer-events-none absolute inset-0 rounded-full border border-sky-300/10 shadow-[0_0_48px_rgba(56,189,248,0.16)]" />
        <div className="pointer-events-none absolute inset-[22px] rounded-full border border-white/5" />
        <svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}>
          <defs>
            <filter id="inventoryGaugeGlow" x="-70%" y="-70%" width="240%" height="240%">
              <feGaussianBlur stdDeviation="2.8" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <circle
            cx={GAUGE_SIZE / 2}
            cy={GAUGE_SIZE / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted) / 0.28)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            transform={`rotate(120 ${GAUGE_SIZE / 2} ${GAUGE_SIZE / 2})`}
          />

          {normalizedSegments.map((segment, index) => {
            const segmentLength = totalPercent > 0 ? (segment.value / totalPercent) * availableArc : 0;
            if (segmentLength <= 0) return null;

            const dashOffset = -consumedArc;
            consumedArc += segmentLength + gapSize;

            return (
              <circle
                key={`${segment.label}-${index}`}
                cx={GAUGE_SIZE / 2}
                cy={GAUGE_SIZE / 2}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={STROKE_WIDTH}
                strokeLinecap="round"
                strokeDasharray={`${segmentLength} ${circumference}`}
                strokeDashoffset={dashOffset}
                filter="url(#inventoryGaugeGlow)"
                style={{ transition: "stroke-dasharray 500ms ease, stroke-dashoffset 500ms ease, stroke 250ms ease" }}
                transform={`rotate(120 ${GAUGE_SIZE / 2} ${GAUGE_SIZE / 2})`}
              />
            );
          })}
        </svg>

        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{currentSlide.title}</p>
          <p className="text-[2.2rem] font-bold leading-none" style={{ color: currentSlide.color }}>{animatedValue}</p>
          <p className="mt-1 text-sm text-muted-foreground">{currentSlide.subtitle}</p>
          <div className="mt-3 flex items-center gap-2" data-testid="inventory-gauge-dots">
            {slides.map((slide, index) => (
              <button
                key={slide.key}
                type="button"
                onClick={() => goToSlide(index)}
                className={`h-2 rounded-full transition-all ${index === activeSlide ? "w-6 bg-primary" : "w-2 bg-muted-foreground/40"}`}
                aria-label={`Ver ${slide.title}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {normalizedSegments.length > 0 ? (
          normalizedSegments.map((segment) => (
            <span
              key={segment.label}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} />
              {segment.label}
            </span>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">Sin categorías todavía.</p>
        )}
      </div>
    </div>
  );
}

export function NfcScanRing({ active }: { active: boolean }) {
  return (
    <div className="relative mx-auto flex h-44 w-44 items-center justify-center">
      <div className="absolute inset-0 rounded-full border border-cyan-400/30 shadow-[0_0_40px_rgba(34,211,238,0.2)]" />
      <div className={`absolute inset-3 rounded-full border border-cyan-300/40 ${active ? "animate-pulse" : ""}`} />
      <div className={`absolute inset-6 rounded-full border-2 border-cyan-200/70 shadow-[0_0_28px_rgba(56,189,248,0.45)] ${active ? "animate-ping" : ""}`} />
      <div className="relative z-10 rounded-full border border-cyan-300/40 bg-background/80 p-6">
        <ScanLine className="h-10 w-10 text-cyan-300" />
      </div>
    </div>
  );
}
