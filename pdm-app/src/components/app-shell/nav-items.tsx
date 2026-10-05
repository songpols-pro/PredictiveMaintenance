"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Bell, ClipboardList, Factory, LayoutDashboard, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { db, getSimulation, getVersion, subscribe } from "@/lib/mock/db";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
  badge?: "alerts";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, match: (p) => p === "/" },
  { href: "/assets", label: "Assets", icon: Factory, match: (p) => p.startsWith("/assets") },
  { href: "/alerts", label: "Alerts", icon: Bell, match: (p) => p.startsWith("/alerts"), badge: "alerts" },
  { href: "/work-orders", label: "Work orders", icon: ClipboardList, match: (p) => p.startsWith("/work-orders") },
  { href: "/settings", label: "Settings", icon: Settings, match: (p) => p.startsWith("/settings") },
];

export function useOpenAlertCount() {
  useSyncExternalStore(subscribe, getVersion, () => 0);
  const simulation = useSyncExternalStore(subscribe, getSimulation, () => "normal" as const);
  if (simulation !== "normal") return 0;
  return db.alerts.filter((a) => a.status === "open").length;
}

export function NavList({ variant, onNavigate }: { variant: "full" | "rail"; onNavigate?: () => void }) {
  const pathname = usePathname();
  const openAlerts = useOpenAlertCount();
  return (
    <ul className={cn("flex flex-col", variant === "full" ? "gap-0.5 px-3" : "items-center gap-1 px-2")}>
      {NAV_ITEMS.map((item) => {
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
              <span className={variant === "rail" ? "text-center leading-tight" : undefined}>{item.label}</span>
              {count > 0 ? (
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-critical px-1.5 text-xs font-semibold text-on-critical tabular",
                    variant === "full" ? "ml-auto" : "absolute top-1 right-2",
                  )}
                >
                  {count}
                  <span className="sr-only"> open</span>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
