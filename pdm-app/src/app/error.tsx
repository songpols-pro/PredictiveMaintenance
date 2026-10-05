"use client";

import { ErrorState } from "@/components/pdm/states";
import { useI18n } from "@/lib/i18n/provider";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { m } = useI18n();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{m.routeError.title}</h1>
      <ErrorState title={m.routeError.screenFailed} error={error} onRetry={reset} />
    </div>
  );
}
