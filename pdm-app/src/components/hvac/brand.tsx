"use client";

import Link from "next/link";
import { Snowflake } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

export function Brand({ compact = false }: { compact?: boolean }) {
  const { m } = useI18n();
  return (
    <Link href="/hvac" className="flex items-center gap-2 rounded-md px-1 py-1 font-semibold" aria-label={m.hvac.product}>
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Snowflake className="size-[18px]" strokeWidth={2.5} />
      </span>
      {compact ? null : (
        <span className="leading-tight">
          <span className="block text-sm">PdM Monitor</span>
          <span className="block text-xs font-normal text-muted-foreground">{m.hvac.product}</span>
        </span>
      )}
    </Link>
  );
}
