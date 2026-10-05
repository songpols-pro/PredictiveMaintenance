"use client";

import { useRef } from "react";

/**
 * Focus management for dialogs and sheets opened from state (no <DialogTrigger>).
 * Radix only knows how to return focus to a Trigger, so we remember the opener ourselves:
 * on close, focus goes to an explicit target (if set), else the opener (if still on the page),
 * else the page heading. Spread `contentProps` onto <DialogContent> / <SheetContent>.
 */
export function useDialogFocus(fallbackId = "page-title") {
  const opener = useRef<HTMLElement | null>(null);
  const target = useRef<string | null>(null);
  return {
    /** Call before closing when the opener is about to disappear (e.g. after a create/delete). */
    returnFocusTo(id: string | null) {
      target.current = id;
    },
    contentProps: {
      onOpenAutoFocus: () => {
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      },
      onCloseAutoFocus: (e: Event) => {
        e.preventDefault();
        const explicit = target.current ? document.getElementById(target.current) : null;
        target.current = null;
        const el = explicit ?? (opener.current?.isConnected ? opener.current : null) ?? document.getElementById(fallbackId);
        el?.focus();
      },
    },
  };
}
