"use client";

// Language and theme menus shared by the product top bar and the marketing header.

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n/provider";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n/config";

/** Each language is named in its own language and marked with `lang` (WCAG 3.1.2). */
export function LanguageMenu() {
  const { m, locale, setLocale } = useI18n();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-1.5 px-2" aria-label={m.topbar.languageAria(LOCALE_NAMES[locale])}>
          <Languages aria-hidden />
          <span aria-hidden className="hidden text-xs font-semibold uppercase sm:inline">
            {locale}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>{m.topbar.language}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={(v) => setLocale(v as Locale)}>
          {LOCALES.map((l) => (
            <DropdownMenuRadioItem key={l} value={l} lang={l}>
              {LOCALE_NAMES[l]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeMenu() {
  const { m } = useI18n();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const Icon = !mounted ? Monitor : resolvedTheme === "dark" ? Moon : Sun;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" aria-label={m.topbar.theme}>
          <Icon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>{m.topbar.themeTitle}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mounted ? theme : undefined} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">{m.topbar.themes.light}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{m.topbar.themes.dark}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">{m.topbar.themes.system}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
