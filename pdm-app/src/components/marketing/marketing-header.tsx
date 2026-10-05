"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LanguageMenu, ThemeMenu } from "@/components/header-menus";
import { useDialogFocus } from "@/components/pdm/use-dialog-focus";
import { useI18n } from "@/lib/i18n/provider";

const SECTIONS = ["features", "how", "tour", "faq", "contact"] as const;

export function Brand() {
  const { m } = useI18n();
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md py-1 font-semibold" aria-label={m.marketing.nav.home}>
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Activity className="size-[18px]" strokeWidth={2.5} />
      </span>
      <span aria-hidden>PdM Monitor</span>
    </Link>
  );
}

export function MarketingHeader() {
  const { m } = useI18n();
  const nav = m.marketing.nav;
  const [open, setOpen] = useState(false);
  const menuFocus = useDialogFocus("main");

  return (
    <>
      <a href="#main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        {m.marketing.skip}
      </a>
      <header className="sticky top-0 z-40 border-b bg-card">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Brand />
          <nav aria-label={nav.label} className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {SECTIONS.map((id) => (
                <li key={id}>
                  <a href={`#${id}`} className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-text-secondary hover:bg-accent hover:text-foreground">
                    {nav[id]}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <LanguageMenu />
            <ThemeMenu />
            <Button variant="ghost" asChild className="hidden h-9 sm:inline-flex">
              <Link href="/app">{nav.signIn}</Link>
            </Button>
            <Button asChild className="hidden h-9 sm:inline-flex">
              <a href="#demo">{nav.requestDemo}</a>
            </Button>
            <Button variant="ghost" size="icon" className="size-9 lg:hidden" aria-label={nav.openMenu} onClick={() => setOpen(true)}>
              <Menu aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-72 p-0" {...menuFocus.contentProps}>
          <SheetHeader className="border-b">
            <SheetTitle>PdM Monitor</SheetTitle>
          </SheetHeader>
          <nav aria-label={nav.label} className="p-3">
            <ul className="flex flex-col gap-0.5">
              {SECTIONS.map((id) => (
                <li key={id}>
                  <a href={`#${id}`} onClick={() => setOpen(false)} className="flex h-10 items-center rounded-md px-3 text-sm font-medium hover:bg-accent">
                    {nav[id]}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-2 border-t pt-4">
              <Button asChild className="h-10">
                <a href="#demo" onClick={() => setOpen(false)}>
                  {nav.requestDemo}
                </a>
              </Button>
              <Button variant="outline" asChild className="h-10">
                <Link href="/app">{nav.signIn}</Link>
              </Button>
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
