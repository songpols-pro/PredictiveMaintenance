"use client";

// Frame of the chiller plant module. Same layout and styling as the PdM Monitor app shell
// (sidebar 240 px ≥ 1280, icon rail 768–1279, sheet below 768, top bar with language and theme),
// plus the mock-up's branding slots: owner logo at the top, partner logos at the bottom, "Designed by".

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Activity, BellRing, ChevronDown, Clock3, Factory, FileSpreadsheet, FlaskConical, LineChart, LogOut, Menu, Network, RotateCw, ShieldAlert, TriangleAlert, Unplug, UsersRound, Zap, type LucideIcon } from "lucide-react";
import { LanguageMenu, ThemeMenu } from "@/components/header-menus";
import { useDialogFocus } from "@/components/pdm/use-dialog-focus";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuItem,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/provider";
import type { Messages } from "@/lib/i18n/messages";
import { useNow } from "@/lib/use-query";
import { HVAC_SITE } from "@/lib/hvac/model";
import { setConnection, useAcked, useConnection, useLive, useLiveError } from "@/lib/hvac/live";
import { HVAC_SOURCE } from "@/lib/hvac/source";
import { signOut } from "@/lib/firebase/session";
import { useHvacAccount } from "@/lib/hvac/account";
import { Brand } from "./brand";

type TitleKey = keyof Messages["hvac"]["titles"];

interface NavItem {
  href: string;
  title: TitleKey | "alarm";
  icon: LucideIcon;
  match: (path: string) => boolean;
  children?: { href: string; title: TitleKey }[];
  /** Shown to service operators only (claim "admin"); the page and its API check again. */
  operatorOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/hvac", title: "plant", icon: Network, match: (p) => p === "/hvac" },
  { href: "/hvac/power", title: "power", icon: Zap, match: (p) => p.startsWith("/hvac/power") },
  { href: "/hvac/trend", title: "trend", icon: LineChart, match: (p) => p.startsWith("/hvac/trend") },
  { href: "/hvac/report", title: "report", icon: FileSpreadsheet, match: (p) => p.startsWith("/hvac/report") },
  {
    href: "/hvac/alarms",
    title: "alarm",
    icon: BellRing,
    match: (p) => p.startsWith("/hvac/alarms"),
    children: [
      { href: "/hvac/alarms", title: "alarms" },
      { href: "/hvac/alarms/logs", title: "alarmLogs" },
    ],
  },
  { href: "/hvac/admin", title: "admin", icon: UsersRound, match: (p) => p.startsWith("/hvac/admin"), operatorOnly: true },
];

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** Active alarms that nobody has acknowledged yet. */
export function useUnackedCount(): number {
  const live = useLive();
  const acked = useAcked();
  return live ? live.alarms.filter((a) => !acked.has(a.id)).length : 0;
}

/** Live data shows only the branding that is filled in; the simulation keeps the mock-up's empty slots. */
const SHOW_EMPTY_SLOTS = HVAC_SOURCE === "sim";
const SHOW_PARTNERS = SHOW_EMPTY_SLOTS || HVAC_SITE.partnerLogos.some(Boolean);

/** Customer logo slot from the mock-up; an empty slot is shown as a labelled placeholder. */
function LogoSlot({ src, label, tall }: { src: string | null; label: string; tall?: boolean }) {
  const { m } = useI18n();
  return src ? (
    <div className={cn("flex items-center justify-center overflow-hidden rounded-md border bg-white", tall ? "h-20" : "h-14")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- customer-supplied logo of unknown size */}
      <img src={src} alt={label} className="max-h-full max-w-full object-contain p-2" />
    </div>
  ) : (
    <div className={cn("flex flex-col items-center justify-center rounded-md border border-dashed bg-muted px-2 text-center", tall ? "h-20" : "h-14")}>
      <span className="text-xs font-semibold text-text-secondary">{label}</span>
      <span className="text-xs text-muted-foreground">{m.hvac.shell.logoSlot}</span>
    </div>
  );
}

function NavList({ variant, onNavigate }: { variant: "full" | "rail"; onNavigate?: () => void }) {
  const { m } = useI18n();
  const hv = m.hvac;
  const pathname = usePathname();
  const unacked = useUnackedCount();
  const operator = useHvacAccount()?.operator === true;
  const itemClass = (active: boolean) =>
    cn(
      "relative flex rounded-md text-sm font-medium transition-colors hover:bg-accent",
      variant === "full" ? "h-9 items-center gap-3 px-3" : "min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-xs",
      active ? "bg-selected text-link" : "text-text-secondary hover:text-foreground",
    );
  return (
    <ul className={cn("flex flex-col", variant === "full" ? "gap-0.5 px-3" : "items-center gap-1 px-2")}>
      {NAV.filter((item) => operator || !item.operatorOnly).map((item) => {
        const active = item.match(pathname);
        const Icon = item.icon;
        const label = item.title === "alarm" ? hv.shell.alarm : hv.titles[item.title];
        const count = item.title === "alarm" ? unacked : 0;
        // With sub-pages the parent only marks the section; the sub-item carries aria-current.
        const current = active && !item.children;
        return (
          <li key={item.href} className={variant === "rail" ? "w-full" : undefined}>
            <Link href={item.href} onClick={onNavigate} aria-current={current ? "page" : undefined} className={itemClass(active)}>
              {active && variant === "full" ? <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" /> : null}
              <Icon aria-hidden className="size-[18px] shrink-0" />
              <span className={variant === "rail" ? "text-center leading-tight" : undefined}>{label}</span>
              {count > 0 ? (
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-critical px-1.5 text-xs font-semibold text-on-critical tabular",
                    variant === "full" ? "ml-auto" : "absolute top-1 right-2",
                  )}
                >
                  <span aria-hidden>{count}</span>
                  <span className="sr-only">{hv.shell.unacked(count)}</span>
                </span>
              ) : null}
            </Link>
            {item.children && variant === "full" ? (
              <ul className="mt-0.5 flex flex-col gap-0.5">
                {item.children.map((child) => {
                  const on = pathname === child.href;
                  return (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        onClick={onNavigate}
                        aria-current={on ? "page" : undefined}
                        className={cn(
                          "flex h-8 items-center rounded-md pr-3 pl-10 text-sm transition-colors hover:bg-accent",
                          on ? "font-medium text-link" : "text-text-secondary hover:text-foreground",
                        )}
                      >
                        {hv.titles[child.title]}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Link to the PdM Monitor app. Hidden with live data: that app still runs on simulated data. */
function PdmLink({ onNavigate }: { onNavigate?: () => void }) {
  const { m } = useI18n();
  if (HVAC_SOURCE !== "sim") return null;
  return (
    <Link href="/app" onClick={onNavigate} className="mx-3 mt-4 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-accent hover:text-foreground">
      <Activity aria-hidden className="size-[18px] shrink-0" />
      {m.hvac.shell.pdm}
    </Link>
  );
}

function PlantClock() {
  const { m, f } = useI18n();
  const now = useNow(1000);
  const time = new Intl.DateTimeFormat(f.tag, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(now);
  const date = new Intl.DateTimeFormat(f.tag, { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Bangkok" }).format(now);
  return (
    <span className="hidden items-center gap-1.5 text-xs text-text-secondary lg:inline-flex" title={m.hvac.shell.plantTime}>
      <Clock3 aria-hidden className="size-3.5" />
      <span className="sr-only">{m.hvac.shell.plantTime}: </span>
      <span className="font-semibold text-foreground tabular">{time}</span>
      <span>{date}</span>
    </span>
  );
}

/** Whole seconds since `at` (the messages turn them into minutes or hours). */
function secondsAgo(at: number, now: number) {
  return Math.max(0, Math.round((now - at) / 1000));
}

function LiveIndicator() {
  const { m } = useI18n();
  const live = useLive();
  const now = useNow(1000);
  if (!live) return null;
  const stale = now - live.receivedAt > live.staleAfter;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs whitespace-nowrap", stale ? "font-semibold text-warning-fg" : "text-text-secondary")}>
      {stale ? (
        <TriangleAlert aria-hidden className="size-3.5 text-warning" />
      ) : (
        <span aria-hidden className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-healthy opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-healthy" />
        </span>
      )}
      <span className="font-semibold">{stale ? m.hvac.shell.stale : m.hvac.shell.live}</span>
      <span className="hidden sm:inline">· {m.hvac.shell.updated(m.hvac.shell.secondsAgo(secondsAgo(live.receivedAt, now)))}</span>
    </span>
  );
}

function DemoMenu() {
  const { m } = useI18n();
  const connection = useConnection();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("h-9", connection === "lost" && "border-warning bg-warning-bg text-warning-fg")} aria-label={m.hvac.shell.demoLabel}>
          <FlaskConical aria-hidden />
          <span className="hidden xl:inline">{m.hvac.shell.demo}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{m.hvac.shell.demoLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={connection} onValueChange={(v) => setConnection(v as "live" | "lost")}>
          <DropdownMenuRadioItem value="live">{m.hvac.shell.demoLive}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="lost">{m.hvac.shell.demoLost}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Shown when readings stop arriving: values on screen are kept but clearly marked as old. */
function ConnectionBanner() {
  const { m } = useI18n();
  const live = useLive();
  const connection = useConnection();
  const now = useNow(1000);
  if (!live) return null;
  const stale = connection === "lost" || now - live.receivedAt > live.staleAfter;
  if (!stale) return null;
  return (
    <div role="alert" className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning-border bg-warning-bg px-4 py-3 md:mx-6 lg:mx-8">
      <Unplug aria-hidden className="size-5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-warning-fg">{m.hvac.shell.lostTitle}</p>
        <p className="text-sm text-foreground">{m.hvac.shell.lostDesc(m.hvac.shell.secondsAgo(secondsAgo(live.receivedAt, now)))}</p>
      </div>
      {HVAC_SOURCE === "sim" ? (
        <Button variant="outline" size="sm" onClick={() => setConnection("live")}>
          <RotateCw aria-hidden />
          {m.hvac.shell.reconnect}
        </Button>
      ) : null}
    </div>
  );
}

/** Live source: Firestore refused the project (access removed) or did not answer. */
function LiveErrorBanner() {
  const { m } = useI18n();
  const error = useLiveError();
  if (!error) return null;
  const denied = error === "denied";
  return (
    <div role="alert" className="mx-4 mt-4 flex items-start gap-3 rounded-lg border border-critical-border bg-critical-bg px-4 py-3 md:mx-6 lg:mx-8">
      <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-critical" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-critical-fg">{denied ? m.hvac.shell.deniedTitle : m.hvac.shell.failedTitle}</p>
        <p className="text-sm text-foreground">{denied ? m.hvac.shell.deniedDesc : m.hvac.shell.failedDesc}</p>
      </div>
    </div>
  );
}

/** Live source: who is signed in, which project is shown, sign out. */
function AccountMenu() {
  const { m } = useI18n();
  const account = useHvacAccount();
  if (!account) return null;
  const name = account.names[account.project];
  // Projects under customer headings for operators and for accounts that see more than one group.
  const headed = account.operator || account.groups.length > 1;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 max-w-56" aria-label={`${m.hvac.shell.project}: ${name}, ${m.hvac.shell.account} ${account.email ?? ""}`}>
          <Factory aria-hidden />
          <span className="hidden truncate sm:inline">{name}</span>
          <ChevronDown aria-hidden className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-1rem)]">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm [overflow-wrap:anywhere]">{m.hvac.shell.signedInAs(account.email ?? "")}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-semibold tracking-normal text-text-secondary uppercase">{m.hvac.shell.switchPlant}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={account.project} onValueChange={account.setProject} aria-label={m.hvac.shell.project}>
          {account.groups.map((g) => {
            const items = g.projects.map((p) => (
              <DropdownMenuRadioItem key={p} value={p}>
                {account.names[p]}
              </DropdownMenuRadioItem>
            ));
            if (!headed) return items;
            const label = g.name ?? (account.operator ? m.hvac.shell.noCustomer : m.hvac.shell.otherProjects);
            return (
              <DropdownMenuGroup key={g.org ?? ""} aria-label={label}>
                <DropdownMenuLabel>{label}</DropdownMenuLabel>
                {items}
              </DropdownMenuGroup>
            );
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut aria-hidden />
          {m.hvac.shell.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function HvacShell({ children }: { children: React.ReactNode }) {
  const { m } = useI18n();
  const hv = m.hvac;
  const mounted = useMounted();
  const unacked = useUnackedCount();
  const account = useHvacAccount();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuFocus = useDialogFocus("main");
  // Live data: the selected project's own logo, else the site-wide one.
  const ownerLogo = account?.ownerLogo ?? HVAC_SITE.ownerLogo;
  const showOwner = SHOW_EMPTY_SLOTS || Boolean(ownerLogo);
  return (
    <div data-shell="hvac" className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {hv.shell.skip}
      </a>

      {/* Full sidebar ≥ 1280px, icon+label rail 768–1279px, sheet below 768px (as in the main app) */}
      <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar md:flex md:w-20 xl:w-60">
        <div className="flex h-(--topbar-height) items-center border-b px-3 xl:px-4">
          <span className="hidden xl:block">
            <Brand />
          </span>
          <span className="mx-auto xl:hidden">
            <Brand compact />
          </span>
        </div>
        {showOwner ? (
          <div className="hidden px-3 pt-3 xl:block">
            <LogoSlot src={ownerLogo} label={hv.shell.ownerLogo} tall />
          </div>
        ) : null}
        <nav aria-label={hv.shell.nav} className="flex-1 overflow-y-auto py-3">
          <div className="hidden xl:block">
            <NavList variant="full" />
            <PdmLink />
          </div>
          <div className="xl:hidden">
            <NavList variant="rail" />
          </div>
        </nav>
        {SHOW_PARTNERS ? (
          <div className="hidden flex-col gap-2 border-t p-3 xl:flex">
            {HVAC_SITE.partnerLogos.map((src, i) => (SHOW_EMPTY_SLOTS || src ? <LogoSlot key={i} src={src} label={hv.shell.partnerLogo(i + 1)} /> : null))}
          </div>
        ) : null}
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 overflow-y-auto p-0" {...menuFocus.contentProps}>
          <SheetHeader className="border-b">
            <SheetTitle asChild>
              <div>
                <Brand />
              </div>
            </SheetTitle>
          </SheetHeader>
          {showOwner ? (
            <div className="px-3 pt-3">
              <LogoSlot src={ownerLogo} label={hv.shell.ownerLogo} tall />
            </div>
          ) : null}
          <nav aria-label={hv.shell.nav} className="py-3">
            <NavList variant="full" onNavigate={() => setMenuOpen(false)} />
            <PdmLink onNavigate={() => setMenuOpen(false)} />
          </nav>
          {SHOW_PARTNERS ? (
            <div className="flex flex-col gap-2 border-t p-3">
              {HVAC_SITE.partnerLogos.map((src, i) => (SHOW_EMPTY_SLOTS || src ? <LogoSlot key={i} src={src} label={hv.shell.partnerLogo(i + 1)} /> : null))}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-(--topbar-height) items-center gap-1 border-b bg-card px-2 sm:gap-2 sm:px-3 md:px-4">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMenuOpen(true)} aria-label={hv.shell.openMenu}>
            <Menu aria-hidden />
          </Button>
          {/* Phones hide the plant button's text: the plant on screen is named here instead. */}
          <p className="min-w-0 truncate text-sm font-semibold">
            <span className={account ? "hidden sm:inline" : undefined}>{hv.product}</span>
            {account ? <span className="sm:hidden">{account.names[account.project]}</span> : null}
          </p>
          <div className="ml-auto flex items-center gap-1 sm:gap-1.5 md:gap-3">
            {mounted ? <LiveIndicator /> : null}
            {mounted ? <PlantClock /> : null}
            {HVAC_SOURCE === "sim" ? <DemoMenu /> : <AccountMenu />}
            <LanguageMenu />
            <ThemeMenu />
          </div>
        </header>
        {mounted ? <ConnectionBanner /> : null}
        {mounted ? <LiveErrorBanner /> : null}
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-5 outline-none md:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px] min-w-0">{children}</div>
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-2 px-4 pb-4 text-xs text-muted-foreground md:px-6 lg:px-8">
          <span>{account ? hv.shell.liveSource(account.names[account.project]) : hv.shell.simulated}</span>
          {HVAC_SITE.designedBy || SHOW_EMPTY_SLOTS ? (
            <span className="font-medium text-text-secondary">{HVAC_SITE.designedBy ? hv.shell.designedBy(HVAC_SITE.designedBy) : hv.shell.designedByPlaceholder}</span>
          ) : null}
        </footer>
      </div>
      <div role="status" className="sr-only">
        {mounted && unacked > 0 ? hv.shell.unacked(unacked) : ""}
      </div>
    </div>
  );
}
