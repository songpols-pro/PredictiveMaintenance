"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentLocale, initCurrentLocale, setCurrentLocale } from "./current";
import { LOCALE_COOKIE, type Locale } from "./config";
import { getFormatters, type Formatters } from "./format";
import { MESSAGES, type Messages } from "./messages";

interface I18nValue {
  locale: Locale;
  m: Messages;
  f: Formatters;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Share the language with non-React code (the API layer). Silent on first render: nothing fetched yet.
  if (getCurrentLocale() !== locale) initCurrentLocale(locale);

  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      setLocaleState(next);
      setCurrentLocale(next); // the API re-fetches data in the new language
      router.refresh(); // re-renders server parts (page titles)
    },
    [router],
  );

  const value = useMemo(() => ({ locale, m: MESSAGES[locale], f: getFormatters(locale), setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
