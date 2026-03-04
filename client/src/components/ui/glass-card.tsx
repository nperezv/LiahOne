import * as React from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const GlassCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <Card
    ref={ref}
    className={cn(
      "relative overflow-hidden rounded-2xl border border-white/10 bg-card/95 dark:bg-zinc-950/55 shadow-lg shadow-black/40 backdrop-blur-xl",
      "before:absolute before:inset-0 before:rounded-2xl before:content-['']",
      "before:bg-[radial-gradient(1200px_circle_at_20%_0%,rgba(124,58,237,0.18),transparent_55%),radial-gradient(900px_circle_at_80%_20%,rgba(0,122,255,0.12),transparent_60%)] before:opacity-45 before:blur-2xl",
      "transition duration-300 ease-out hover:-translate-y-0.5 hover:border-white/15 hover:shadow-black/60",
      className
    )}
    {...props}
  />
));

GlassCard.displayName = "GlassCard";
