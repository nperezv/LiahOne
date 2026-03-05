import * as React from "react";

import { cn } from "@/lib/utils";

type Tone = "violet" | "emerald" | "amber" | "rose" | "blue";

const toneStyles: Record<Tone, string> = {
  violet: "pilot-icon-badge--violet",
  emerald: "pilot-icon-badge--emerald",
  amber: "pilot-icon-badge--amber",
  rose: "pilot-icon-badge--rose",
  blue: "pilot-icon-badge--blue",
};

export function IconBadge({ className, children, tone = "violet" }: React.HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return (
    <div
      className={cn(
        "pilot-icon-badge",
        toneStyles[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}
