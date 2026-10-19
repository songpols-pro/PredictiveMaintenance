"use client";

// Pieces shared by the tabs of the admin page (admin.tsx, admin-customers.tsx, admin-plants.tsx,
// admin-modbus.tsx, admin-models.tsx, admin-accounts.tsx).

import { useCallback, useEffect, useRef } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import type { Overview } from "@/lib/access/model";
import { AdminApiError } from "@/lib/hvac/admin-api";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * List tables of the admin page on phones: each row becomes a block, its cells one under another and its
 * buttons on the left, instead of a wide table whose buttons sit off screen. The header row stays for
 * screen readers; cells whose value needs its column name show a CellLabel.
 */
export const STACKED_TABLE =
  "w-full text-sm max-md:block max-md:[&_tbody]:block max-md:[&_thead]:sr-only max-md:[&_tr]:block max-md:[&_tr]:py-2 max-md:[&_th]:block max-md:[&_td]:block max-md:[&_th]:py-1 max-md:[&_td]:py-1 max-md:[&_td]:text-left max-md:[&_td>div]:justify-start";

/** The column name in front of a cell's value, on phones only (STACKED_TABLE hides the header row there). */
export function CellLabel({ children }: { children: React.ReactNode }) {
  return <span className="mr-1 text-xs text-text-secondary md:hidden">{children}:</span>;
}

/** What each tab gets: the latest overview, and a way to load it again after a change. */
export interface AdminData {
  data: Overview;
  reload: () => Promise<void>;
}

export const plantName = (data: Overview, id: string) => data.projects.find((p) => p.id === id)?.name ?? id;
export const orgName = (data: Overview, id: string) => data.orgs.find((o) => o.id === id)?.name ?? id;

/** An id suggested from a Latin-letter name ("ACME Co., Ltd." → "acme-co-ltd"); empty for other scripts. */
export function suggestId(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "");
}

/** The message for a failed admin call, in the page's language. */
export function useErrorText() {
  const { m } = useI18n();
  return useCallback(
    (e: unknown) => {
      const errors = m.hvac.admin.errors;
      return e instanceof AdminApiError ? errors[e.code](e.ids.join(", ")) : errors.failed("");
    },
    [m],
  );
}

/** A refused change: announced, and focusable so focus can be moved to it. */
export function FormFailure({ title, text, ref }: { title: string; text: string; ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="rounded-lg border border-critical-border bg-critical-bg p-3 text-sm outline-none">
      <p className="flex items-center gap-1.5 font-semibold text-critical-fg">
        <TriangleAlert aria-hidden className="size-4 shrink-0" />
        {title}
      </p>
      <p className="mt-1 text-foreground">{text}</p>
    </div>
  );
}

/** Cancel (or `cancel`, such as "Skip for now") and submit at the foot of a dialog form; `danger` for deleting or disabling. */
export function DialogButtons({ working, submit, cancel, onCancel, danger }: { working: boolean; submit: string; cancel?: string; onCancel: () => void; danger?: boolean }) {
  const { m } = useI18n();
  const a = m.hvac.admin;
  return (
    <DialogFooter className="sticky bottom-0 z-10 bg-popover">
      <Button type="button" variant="outline" className="h-10" onClick={onCancel}>
        {cancel ?? a.cancel}
      </Button>
      <Button type="submit" className={cn("h-10", danger && "bg-critical text-on-critical hover:bg-critical/90")} aria-disabled={working || undefined}>
        {working ? a.saving : submit}
      </Button>
    </DialogFooter>
  );
}

/** After a failed submit, focus goes to the refusal, or else to the first invalid field. */
export function useFailureFocus(attempt: number, failure: string | null, form: React.RefObject<HTMLFormElement | null>, box: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!attempt) return;
    if (failure) box.current?.focus();
    else form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [attempt, failure, form, box]);
}

/** aria-invalid and aria-describedby of a field: its error (shown from the first save on) and its hint. */
export function fieldProps(show: boolean, base: string, error: string | undefined, hint = false) {
  return {
    "aria-invalid": show && error ? true : undefined,
    "aria-describedby": [show && error ? `${base}-err` : null, hint ? `${base}-hint` : null].filter(Boolean).join(" ") || undefined,
  } as const;
}

/** The error under a field (id `${base}-err`), from the first save on. */
export function fieldError(show: boolean, base: string, error: string | undefined) {
  return show && error ? (
    <p id={`${base}-err`} className="mt-1 text-xs text-critical-fg">
      {error}
    </p>
  ) : null;
}

/** focusLater(id): focus moves to that element after the next render (a row added, moved or removed). */
export function useFocusAfter() {
  const next = useRef<string | null>(null);
  useEffect(() => {
    if (!next.current) return;
    document.getElementById(next.current)?.focus();
    next.current = null;
  });
  return useCallback((id: string) => {
    next.current = id;
  }, []);
}
