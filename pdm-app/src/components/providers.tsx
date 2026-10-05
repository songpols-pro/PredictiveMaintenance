"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

interface SiteContextValue {
  siteId: string | null; // null = all sites
  setSiteId: (id: string | null) => void;
}

const SiteContext = createContext<SiteContextValue>({ siteId: null, setSiteId: () => {} });

export function useSite() {
  return useContext(SiteContext);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [siteId, setSiteId] = useState<string | null>(null);
  const site = useMemo(() => ({ siteId, setSiteId }), [siteId]);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={300}>
        <SiteContext.Provider value={site}>
          {children}
          <Toaster position="bottom-right" closeButton />
        </SiteContext.Provider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
