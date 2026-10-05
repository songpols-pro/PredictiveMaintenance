import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  meta,
  actions,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0 space-y-1">
        {children}
        <h1 id="page-title" tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">
          {title}
        </h1>
        {description ? <p className="text-sm text-text-secondary">{description}</p> : null}
        {meta ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({
  id,
  title,
  description,
  actions,
  as: Tag = "h2",
}: {
  id?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <Tag id={id} className="text-base font-semibold">
          {title}
        </Tag>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
