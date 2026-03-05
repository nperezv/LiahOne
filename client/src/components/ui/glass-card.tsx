import * as React from "react";

import { cn } from "@/lib/utils";

const GlassCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "pilot-glass-card",
      className,
    )}
    {...props}
  >
    <div className="relative z-10">{children}</div>
  </div>
));

GlassCard.displayName = "GlassCard";

export { GlassCard };
