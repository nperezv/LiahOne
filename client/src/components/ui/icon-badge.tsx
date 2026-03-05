import * as React from "react";

import { cn } from "@/lib/utils";

type Tone = "violet" | "emerald" | "amber" | "rose" | "blue";

const toneStyles: Record<Tone, string> = {
  violet: "bg-[linear-gradient(135deg,#7c3aed,#4f46e5)]",
  emerald: "bg-[linear-gradient(135deg,#059669,#0d9488)]",
  amber: "bg-[linear-gradient(135deg,#d97706,#b45309)]",
  rose: "bg-[linear-gradient(135deg,#e11d48,#be123c)]",
  blue: "bg-[linear-gradient(135deg,#2563eb,#1d4ed8)]",
};

export function IconBadge({ className, children, tone = "violet" }: React.HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-[10px] shadow-[0_4px_12px_rgba(0,0,0,0.5)]",
        toneStyles[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}
