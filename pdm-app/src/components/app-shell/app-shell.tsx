"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NavList } from "./nav-items";
import { TopBar } from "./top-bar";
import { useDialogFocus } from "@/components/pdm/use-dialog-focus";
import { useI18n } from "@/lib/i18n/provider";

function Brand({ compact = false }: { compact?: boolean }) {
  const { m } = useI18n();
  return (
    <Link href="/app" className="flex items-center gap-2 rounded-md px-1 py-1 font-semibold" aria-label={m.nav.home}>
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Activity className="size-[18px]" strokeWidth={2.5} />
      </span>
      {compact ? null : (
        <span className="leading-tight">
          <span className="block text-sm">PdM Monitor</span>
          <span className="block text-xs font-normal text-muted-foreground">{m.meta.tagline}</span>
        </span>
      )}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { m } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuFocus = useDialogFocus("main");
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {m.nav.skip}
      </a>

      {/* Full sidebar ≥ 1280px, icon+label rail 768–1279px, sheet below 768px */}
      <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar md:flex md:w-20 xl:w-60">
        <div className="flex h-(--topbar-height) items-center border-b px-3 xl:px-4">
          <span className="hidden xl:block">
            <Brand />
          </span>
          <span className="mx-auto xl:hidden">
            <Brand compact />
          </span>
        </div>
        <nav aria-label={m.nav.primary} className="flex-1 overflow-y-auto py-3">
          <div className="hidden xl:block">
            <NavList variant="full" />
          </div>
          <div className="xl:hidden">
            <NavList variant="rail" />
          </div>
        </nav>
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 p-0" {...menuFocus.contentProps}>
          <SheetHeader className="border-b">
            <SheetTitle asChild>
              <div>
                <Brand />
              </div>
            </SheetTitle>
          </SheetHeader>
          <nav aria-label={m.nav.primary} className="py-3">
            <NavList variant="full" onNavigate={() => setMenuOpen(false)} />
          </nav>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMenu={() => setMenuOpen(true)} />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-5 outline-none md:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px] min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
