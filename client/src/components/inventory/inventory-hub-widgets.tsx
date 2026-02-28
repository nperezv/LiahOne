import { useMemo, useRef, useState, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight, ScanLine } from "lucide-react";

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

const GAUGE_SIZE = 190;
const STROKE_WIDTH = 16;
const SWEEP_ANGLE = 300;

export function InventoryGauge({ total, segments }: InventoryGaugeProps) {
  const radius = (GAUGE_SIZE - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (SWEEP_ANGLE / 360) * circumference;
  const chartSegments = segments.slice(0, 6);

  const normalizedSegments = chartSegments.map((segment) => {
    const normalizedValue = Math.max(0, Math.min(100, Number(segment.value) || 0));
    return { ...segment, value: normalizedValue };
  });

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
  const startX = useRef<number | null>(null);

  const goToSlide = (nextIndex: number) => {
    const boundedIndex = Math.max(0, Math.min(nextIndex, slides.length - 1));
    setActiveSlide(boundedIndex);
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    startX.current = event.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (startX.current == null) return;
    const endX = event.changedTouches[0]?.clientX ?? startX.current;
    const delta = endX - startX.current;
    if (Math.abs(delta) > 25) {
      goToSlide(activeSlide + (delta < 0 ? 1 : -1));
    }
    startX.current = null;
  };

  const currentSlide = slides[activeSlide] ?? slides[0];

  let consumedArc = 0;

  return (
    <div className="space-y-4">
      <div className="relative mx-auto w-fit" data-testid="inventory-gauge">
        <svg width={GAUGE_SIZE} height={GAUGE_SIZE} viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}>
          <circle
            cx={GAUGE_SIZE / 2}
            cy={GAUGE_SIZE / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted) / 0.4)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            transform={`rotate(120 ${GAUGE_SIZE / 2} ${GAUGE_SIZE / 2})`}
          />

          {normalizedSegments.map((segment, index) => {
            const segmentLength = (segment.value / 100) * arcLength;
            if (segmentLength <= 0) return null;

            const dashOffset = -consumedArc;
            consumedArc += segmentLength;

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
                style={{ transition: "stroke-dasharray 400ms ease, stroke-dashoffset 400ms ease" }}
                transform={`rotate(120 ${GAUGE_SIZE / 2} ${GAUGE_SIZE / 2})`}
              />
            );
          })}
        </svg>

        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{currentSlide.title}</p>
          <p className="text-[2.2rem] font-bold leading-none" style={{ color: currentSlide.color }}>{currentSlide.value}</p>
          <p className="mt-1 text-sm text-muted-foreground">{currentSlide.subtitle}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToSlide(activeSlide - 1)}
              className="rounded-full border border-border/70 p-1 text-muted-foreground transition hover:text-foreground"
              aria-label="Categoría anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-1">
              {slides.map((slide, index) => (
                <button
                  key={slide.key}
                  type="button"
                  onClick={() => goToSlide(index)}
                  className={`h-1.5 w-1.5 rounded-full transition ${index === activeSlide ? "bg-foreground" : "bg-muted-foreground/40"}`}
                  aria-label={`Ver ${slide.title}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => goToSlide(activeSlide + 1)}
              className="rounded-full border border-border/70 p-1 text-muted-foreground transition hover:text-foreground"
              aria-label="Siguiente categoría"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
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
