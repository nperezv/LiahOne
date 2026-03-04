import * as React from "react";

import { cn } from "@/lib/utils";

export function IconBadge({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full bg-white/5 border border-white/10",
        "shadow-[0_0_0_1px_rgba(124,58,237,0.18),0_12px_30px_rgba(124,58,237,0.12)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
