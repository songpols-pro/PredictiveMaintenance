"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Bell, FlaskConical, Menu, Monitor, Moon, Search, Sun } from "lucide-react";
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
import { useOpenAlertCount } from "./nav-items";
import { api } from "@/lib/api";
import { getSimulation, setSimulation, subscribe } from "@/lib/mock/db";
import type { SimulationMode } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIM_LABEL: Record<SimulationMode, string> = {
  normal: "Live data",
  loading: "Loading",
  empty: "Empty",
  error: "Error",
};

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const router = useRouter();
  const { siteId, setSiteId } = useSite();
  const [query, setQuery] = useState("");
  const simulation = useSyncExternalStore(subscribe, getSimulation, () => "normal" as const);
  const openAlerts = useOpenAlertCount();
  const user = api.users().find((u) => u.id === api.currentUserId)!;

  return (
    <header className="sticky top-0 z-30 flex h-(--topbar-height) items-center gap-1 border-b bg-card px-2 sm:gap-2 sm:px-3 md:px-4">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMenu} aria-label="Open navigation">
        <Menu aria-hidden />
      </Button>

      <form
        role="search"
        className="relative hidden w-full max-w-xs sm:block"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(query.trim() ? `/assets?q=${encodeURIComponent(query.trim())}` : "/assets");
        }}
      >
        <label htmlFor="global-search" className="sr-only">
          Search assets by name or ID
        </label>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="global-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search assets (name or ID)"
          className="h-9 pl-8"
        />
      </form>

      <div className="ml-auto flex items-center gap-1 sm:gap-1.5 md:gap-2">
        <div className="flex items-center gap-1.5">
          <label htmlFor="site-select" className="hidden text-xs font-medium text-text-secondary lg:inline">
            Site
          </label>
          <Select value={siteId ?? "all"} onValueChange={(v) => setSiteId(v === "all" ? null : v)}>
            <SelectTrigger id="site-select" aria-label="Site" className="h-9 w-28 min-w-0 sm:w-auto sm:min-w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
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
              aria-label={`Demo state: ${SIM_LABEL[simulation]}`}
            >
              <FlaskConical aria-hidden />
              <span className="hidden xl:inline">Demo: {SIM_LABEL[simulation]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Preview screen states</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={simulation} onValueChange={(v) => setSimulation(v as SimulationMode)}>
              <DropdownMenuRadioItem value="normal">Live data</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="loading">Loading (never resolves)</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="empty">Empty (no records)</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="error">Error (service down)</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeMenu />

        <Button variant="ghost" size="icon" className="relative hidden size-9 sm:inline-flex" asChild>
          <Link href="/alerts" aria-label={openAlerts > 0 ? `Alerts, ${openAlerts} open` : "Alerts"}>
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
            <Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label={`Account: ${user.name}`}>
              <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {user.initials}
              </span>
              <span className="hidden text-left leading-tight xl:block">
                <span className="block text-xs font-medium">{user.name}</span>
                <span className="block text-xs text-muted-foreground">{user.role}</span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block text-sm font-medium text-foreground">{user.name}</span>
              <span className="block text-xs text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/settings")}>Settings</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => toast.info("Sign-out is disabled in this demo.")}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function ThemeMenu() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const Icon = !mounted ? Monitor : resolvedTheme === "dark" ? Moon : Sun;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" aria-label="Color theme">
          <Icon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mounted ? theme : undefined} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
