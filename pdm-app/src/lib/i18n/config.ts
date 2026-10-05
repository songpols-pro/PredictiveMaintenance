export type Locale = "en" | "th";

export const LOCALES: Locale[] = ["th", "en"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "pdm-locale";

/** Each language's name written in that language, for the switcher. */
export const LOCALE_NAMES: Record<Locale, string> = { th: "ไทย", en: "English" };

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "th";
}

/** Saved choice first, then the browser's preferred languages, then English. */
export function pickLocale(cookieValue?: string | null, acceptLanguage?: string | null): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  const preferred = (acceptLanguage ?? "")
    .split(",")
    .map((part) => part.split(";")[0].trim().toLowerCase().slice(0, 2));
  for (const code of preferred) if (isLocale(code)) return code;
  return DEFAULT_LOCALE;
}
