import * as React from "react";

import { cn } from "@/lib/utils";

const glowMask = "radial-gradient(ellipse_at_top_left,black_0%,transparent_60%),radial-gradient(ellipse_at_top_right,black_0%,transparent_60%)";

const GlassCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-[0_18px_60px_rgba(0,0,0,0.65)] transition will-change-transform hover:-translate-y-[1px] hover:border-white/15",
      className,
    )}
    {...props}
  >
    <div className="absolute inset-px rounded-[calc(theme(borderRadius.2xl)-1px)] bg-[#070A12]/85 backdrop-blur-xl" aria-hidden="true" />
    <div
      className="absolute inset-px rounded-[calc(theme(borderRadius.2xl)-1px)] opacity-[0.12] blur-xl bg-[radial-gradient(900px_circle_at_12%_8%,rgba(124,58,237,0.45),transparent_58%),radial-gradient(700px_circle_at_88%_18%,rgba(0,122,255,0.30),transparent_62%)]"
      style={{ maskImage: glowMask, WebkitMaskImage: glowMask }}
      aria-hidden="true"
    />
    <div className="absolute inset-px rounded-[calc(theme(borderRadius.2xl)-1px)] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),transparent_28%)] opacity-60" aria-hidden="true" />
    <div className="relative z-10">{children}</div>
  </div>
));

GlassCard.displayName = "GlassCard";

export { GlassCard };
