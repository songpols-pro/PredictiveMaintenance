"use client";

import { ErrorState } from "@/components/pdm/states";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <ErrorState title="This screen failed to render" error={error} onRetry={reset} />
    </div>
  );
}
