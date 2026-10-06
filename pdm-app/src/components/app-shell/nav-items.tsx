"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useSyncExternalStore } from "react";
import { Bell, ClipboardList, Factory, LayoutDashboard, Settings, Snowflake, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { db, getSimulation, getVersion, subscribe } from "@/lib/mock/db";
import { useI18n } from "@/lib/i18n/provider";
import type { Messages } from "@/lib/i18n/messages";

interface NavItem {
  href: string;
  label: keyof Pick<Messages["nav"], "overview" | "assets" | "alerts" | "workOrders" | "settings" | "chillerPlant">;
  icon: LucideIcon;
  match: (path: string) => boolean;
  badge?: "alerts";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "overview", icon: LayoutDashboard, match: (p) => p === "/app" },
  { href: "/app/assets", label: "assets", icon: Factory, match: (p) => p.startsWith("/app/assets") },
  { href: "/app/alerts", label: "alerts", icon: Bell, match: (p) => p.startsWith("/app/alerts"), badge: "alerts" },
  { href: "/app/work-orders", label: "workOrders", icon: ClipboardList, match: (p) => p.startsWith("/app/work-orders") },
  { href: "/app/settings", label: "settings", icon: Settings, match: (p) => p.startsWith("/app/settings") },
];

/** Other modules of the product, listed under their own heading (each has its own menu once opened). */
export const SYSTEM_ITEMS: NavItem[] = [{ href: "/hvac", label: "chillerPlant", icon: Snowflake, match: (p) => p.startsWith("/hvac") }];

export function useOpenAlertCount() {
  useSyncExternalStore(subscribe, getVersion, () => 0);
  const simulation = useSyncExternalStore(subscribe, getSimulation, () => "normal" as const);
  if (simulation !== "normal") return 0;
  return db.alerts.filter((a) => a.status === "open").length;
}

export function NavList({ variant, onNavigate }: { variant: "full" | "rail"; onNavigate?: () => void }) {
  const pathname = usePathname();
  const openAlerts = useOpenAlertCount();
  const { m } = useI18n();
  const systemsId = useId();
  const list = (items: NavItem[]) =>
    items.map((item) => {
      const active = item.match(pathname);
      const Icon = item.icon;
      const count = item.badge === "alerts" ? openAlerts : 0;
      return (
        <li key={item.href} className={variant === "rail" ? "w-full" : undefined}>
          <Link
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex rounded-md text-sm font-medium transition-colors hover:bg-accent",
              variant === "full"
                ? "h-9 items-center gap-3 px-3"
                : "min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-xs",
              active ? "bg-selected text-link" : "text-text-secondary hover:text-foreground",
            )}
          >
            {active && variant === "full" ? (
              <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
            ) : null}
            <Icon aria-hidden className="size-[18px] shrink-0" />
            <span className={variant === "rail" ? "text-center leading-tight" : undefined}>{m.nav[item.label]}</span>
            {count > 0 ? (
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-critical px-1.5 text-xs font-semibold text-on-critical tabular",
                  variant === "full" ? "ml-auto" : "absolute top-1 right-2",
                )}
              >
                {count}
                <span className="sr-only">{m.nav.openSuffix}</span>
              </span>
            ) : null}
          </Link>
        </li>
      );
    });
  return (
    <>
      <ul className={cn("flex flex-col", variant === "full" ? "gap-0.5 px-3" : "items-center gap-1 px-2")}>{list(NAV_ITEMS)}</ul>
      <div className={cn("mt-4 border-t pt-3", variant === "full" ? "mx-3" : "mx-2")}>
        <p id={systemsId} className={cn("mb-1 px-3 text-xs font-medium text-muted-foreground", variant === "rail" && "sr-only")}>
          {m.nav.systems}
        </p>
        <ul aria-labelledby={systemsId} className={cn("flex flex-col", variant === "full" ? "gap-0.5" : "items-center gap-1")}>
          {list(SYSTEM_ITEMS)}
        </ul>
      </div>
    </>
  );
}
