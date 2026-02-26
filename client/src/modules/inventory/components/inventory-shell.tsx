import type { ReactNode } from "react";
import { BottomTabs } from "./bottom-tabs";

export function InventoryShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-full w-full max-w-md bg-gradient-to-b from-[#070A10] to-[#0B1220] px-4 pb-28 pt-4 text-white md:rounded-3xl md:border md:border-white/10">
      {children}
      <BottomTabs />
    </div>
  );
}
