import * as React from "react";

import { cn } from "@/lib/utils";

const GlassCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative overflow-hidden rounded-2xl bg-[#0B0F19]/70 border border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.55)] transition will-change-transform hover:-translate-y-[1px] hover:border-white/15",
      "before:content-[''] before:absolute before:inset-0 before:rounded-2xl before:opacity-[0.16] before:blur-2xl",
      "before:bg-[radial-gradient(900px_circle_at_12%_8%,rgba(124,58,237,0.35),transparent_55%),radial-gradient(700px_circle_at_88%_18%,rgba(0,122,255,0.22),transparent_60%)]",
      "before:[mask-image:radial-gradient(ellipse_at_top_left,black_0%,transparent_60%),radial-gradient(ellipse_at_top_right,black_0%,transparent_60%)]",
      className,
    )}
    {...props}
  >
    <div className="relative z-10">{children}</div>
  </div>
));

GlassCard.displayName = "GlassCard";

export { GlassCard };
