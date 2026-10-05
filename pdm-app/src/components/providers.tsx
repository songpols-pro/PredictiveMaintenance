"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/config";

interface SiteContextValue {
  siteId: string | null; // null = all sites
  setSiteId: (id: string | null) => void;
}

const SiteContext = createContext<SiteContextValue>({ siteId: null, setSiteId: () => {} });

export function useSite() {
  return useContext(SiteContext);
}

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const [siteId, setSiteId] = useState<string | null>(null);
  const site = useMemo(() => ({ siteId, setSiteId }), [siteId]);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <I18nProvider initialLocale={locale}>
        <TooltipProvider delayDuration={300}>
          <SiteContext.Provider value={site}>
            {children}
            <Toaster position="bottom-right" closeButton />
          </SiteContext.Provider>
        </TooltipProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
