// Shared loading / empty / error states so every screen handles them the same way.

import { CloudOff, RotateCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed bg-card text-center",
        compact ? "gap-1.5 px-4 py-6" : "gap-2 px-6 py-12",
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon aria-hidden className="size-5 text-muted-foreground" />
      </span>
      <p className="font-semibold">{title}</p>
      {description ? <p className="max-w-md text-sm text-text-secondary">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Couldn’t load this data",
  error,
  onRetry,
  className,
  compact,
}: {
  title?: string;
  error?: Error;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-critical-border bg-critical-bg text-center",
        compact ? "px-4 py-6" : "px-6 py-12",
        className,
      )}
    >
      <CloudOff aria-hidden className="size-6 text-critical" />
      <p className="font-semibold text-critical-fg">{title}</p>
      <p className="max-w-md text-sm text-foreground">
        {error?.message ?? "Something went wrong."} Check your connection, then try again.
      </p>
      {onRetry ? (
        <Button variant="outline" size="lg" className="mt-2 bg-card" onClick={onRetry}>
          <RotateCw aria-hidden />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Skeleton block with a screen-reader label; announced once via aria-busy on the region. */
export function LoadingBlock({ label, className, lines = 3 }: { label: string; className?: string; lines?: number }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col gap-2", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className, height = "h-28" }: { className?: string; height?: string }) {
  return <Skeleton aria-hidden className={cn("rounded-lg", height, className)} />;
}
