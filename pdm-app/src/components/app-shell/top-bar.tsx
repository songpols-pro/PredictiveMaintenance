"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Bell, FlaskConical, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSite } from "@/components/providers";
import { LanguageMenu, ThemeMenu } from "@/components/header-menus";
import { useOpenAlertCount } from "./nav-items";
import { api } from "@/lib/api";
import { getSimulation, setSimulation, subscribe } from "@/lib/mock/db";
import type { SimulationMode } from "@/lib/types";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

const SIM_MODES: SimulationMode[] = ["normal", "loading", "empty", "error"];

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const router = useRouter();
  const { m } = useI18n();
  const { siteId, setSiteId } = useSite();
  const [query, setQuery] = useState("");
  const simulation = useSyncExternalStore(subscribe, getSimulation, () => "normal" as const);
  const openAlerts = useOpenAlertCount();
  const user = api.users().find((u) => u.id === api.currentUserId)!;
  const simLabel = m.topbar.demoShort[simulation];

  return (
    <header className="sticky top-0 z-30 flex h-(--topbar-height) items-center gap-1 border-b bg-card px-2 sm:gap-2 sm:px-3 md:px-4">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMenu} aria-label={m.nav.openMenu}>
        <Menu aria-hidden />
      </Button>

      <form
        role="search"
        className="relative hidden w-full max-w-xs sm:block"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(query.trim() ? `/app/assets?q=${encodeURIComponent(query.trim())}` : "/app/assets");
        }}
      >
        <label htmlFor="global-search" className="sr-only">
          {m.topbar.searchLabel}
        </label>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="global-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={m.topbar.searchPlaceholder}
          className="h-9 pl-8"
        />
      </form>

      <div className="ml-auto flex items-center gap-1 sm:gap-1.5 md:gap-2">
        <div className="flex items-center gap-1.5">
          <label htmlFor="site-select" className="hidden text-xs font-medium text-text-secondary lg:inline">
            {m.topbar.site}
          </label>
          <Select value={siteId ?? "all"} onValueChange={(v) => setSiteId(v === "all" ? null : v)}>
            <SelectTrigger id="site-select" aria-label={m.topbar.site} className="h-9 w-24 min-w-0 sm:w-auto sm:min-w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{m.common.allSites}</SelectItem>
              {api.sites().map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className={cn("h-9", simulation !== "normal" && "border-warning bg-warning-bg text-warning-fg")}
              aria-label={m.topbar.demoAria(simLabel)}
            >
              <FlaskConical aria-hidden />
              <span className="hidden xl:inline">{m.topbar.demoButton(simLabel)}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{m.topbar.demoTitle}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={simulation} onValueChange={(v) => setSimulation(v as SimulationMode)}>
              {SIM_MODES.map((mode) => (
                <DropdownMenuRadioItem key={mode} value={mode}>
                  {m.topbar.demoItems[mode]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <LanguageMenu />
        <ThemeMenu />

        <Button variant="ghost" size="icon" className="relative hidden size-9 sm:inline-flex" asChild>
          <Link href="/app/alerts" aria-label={m.topbar.alertsLink(openAlerts)}>
            <Bell aria-hidden />
            {openAlerts > 0 ? (
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[0.6875rem] leading-none font-semibold text-on-critical tabular"
              >
                {openAlerts}
              </span>
            ) : null}
          </Link>
        </Button>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label={m.topbar.account(user.name)}>
              <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {user.initials}
              </span>
              <span className="hidden text-left leading-tight xl:block">
                <span className="block text-xs font-medium">{user.name}</span>
                <span className="block text-xs text-muted-foreground">{m.roles[user.role]}</span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block text-sm font-medium text-foreground">{user.name}</span>
              <span className="block text-xs text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/app/settings")}>{m.topbar.settings}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => toast.info(m.topbar.signOutDisabled)}>{m.topbar.signOut}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
