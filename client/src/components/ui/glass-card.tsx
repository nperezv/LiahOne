import * as React from "react";

import { cn } from "@/lib/utils";

const GlassCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative overflow-hidden rounded-2xl border border-white/[0.04] bg-[linear-gradient(135deg,#0d0d10_0%,#0d0d10_65%,#1e1e22_100%)] shadow-[0_8px_28px_rgba(0,0,0,0.6),0_2px_8px_rgba(0,0,0,0.4)] transition-all duration-300 ease-out will-change-transform hover:-translate-y-1 hover:scale-[1.01] hover:shadow-[0_16px_48px_rgba(0,0,0,0.7),0_4px_16px_rgba(0,0,0,0.5)]",
      className,
    )}
    {...props}
  >
    <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_30%)]" aria-hidden="true" />
    <div className="relative z-10">{children}</div>
  </div>
));

GlassCard.displayName = "GlassCard";

export { GlassCard };
