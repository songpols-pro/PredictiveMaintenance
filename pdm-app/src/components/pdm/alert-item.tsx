"use client";

import Link from "next/link";
import { ClipboardList, UserRound } from "lucide-react";
import type { AlertRow } from "@/lib/api";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n/provider";
import { AlertStatusChip, SeverityChip } from "./status";
import { cn } from "@/lib/utils";

/** Compact alert row for overview and asset pages. Links into the Alerts screen. */
export function AlertItem({ alert, now, showAsset = true, className }: { alert: AlertRow; now: number; showAsset?: boolean; className?: string }) {
  const { m, f } = useI18n();
  return (
    <article className={cn("flex flex-col gap-1.5 py-3", className)} aria-labelledby={`alert-${alert.id}-title`}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityChip severity={alert.severity} size="sm" />
        <AlertStatusChip status={alert.status} />
        <span className="ml-auto text-xs text-muted-foreground">
          <time dateTime={alert.triggeredAt} title={f.dateTime(alert.triggeredAt)}>
            {f.relative(alert.triggeredAt, now)}
          </time>
        </span>
      </div>
      <h3 id={`alert-${alert.id}-title`} className="text-sm font-medium">
        <Link href={`/app/alerts?id=${alert.id}`} className="underline-offset-2 hover:underline">
          {alert.title}
        </Link>
      </h3>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
        {showAsset ? (
          <Link href={`/app/assets/${alert.asset.id}`} className="font-medium text-link underline underline-offset-2 hover:decoration-2">
            {alert.asset.name}
          </Link>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <UserRound aria-hidden className="size-3.5 text-muted-foreground" />
          <span className="sr-only">{m.status.sr.assignee}</span>
          {api.userName(alert.assigneeId)}
        </span>
        {alert.workOrderId ? (
          <Link href={`/app/work-orders?wo=${alert.workOrderId}`} className="inline-flex items-center gap-1 text-link underline underline-offset-2 hover:decoration-2">
            <ClipboardList aria-hidden className="size-3.5" />
            {alert.workOrderId}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
