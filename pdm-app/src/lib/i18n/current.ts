// The active language as a tiny shared store, so non-React code (the API layer) can follow
// the user's choice without the i18n provider importing it.

import { DEFAULT_LOCALE, type Locale } from "./config";

let current: Locale = DEFAULT_LOCALE;
const listeners = new Set<(locale: Locale) => void>();

export function getCurrentLocale(): Locale {
  return current;
}

/** Set without notifying: used during the first render, before anything has been fetched. */
export function initCurrentLocale(locale: Locale) {
  current = locale;
}

export function setCurrentLocale(locale: Locale) {
  if (locale === current) return;
  current = locale;
  listeners.forEach((fn) => fn(locale));
}

export function onLocaleChange(fn: (locale: Locale) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
