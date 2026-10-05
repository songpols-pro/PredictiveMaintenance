"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/provider";
import { SITE_CONTACT } from "@/lib/site-config";
import { Brand } from "./marketing-header";

const SECTIONS = ["features", "how", "tour", "faq"] as const;
const YEAR = new Date().getFullYear();

export function MarketingFooter() {
  const { m } = useI18n();
  const mk = m.marketing;
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <Brand />
          <p className="max-w-sm text-sm text-text-secondary">{mk.footer.tagline}</p>
        </div>
        <nav aria-labelledby="footer-product">
          <h2 id="footer-product" className="text-sm font-semibold">
            {mk.footer.product}
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {SECTIONS.map((id) => (
              <li key={id}>
                <a href={`#${id}`} className="text-text-secondary underline-offset-2 hover:text-foreground hover:underline">
                  {mk.nav[id]}
                </a>
              </li>
            ))}
            <li>
              <Link href="/app" className="text-text-secondary underline-offset-2 hover:text-foreground hover:underline">
                {mk.footer.signIn}
              </Link>
            </li>
          </ul>
        </nav>
        <div>
          <h2 className="text-sm font-semibold">{mk.footer.contact}</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-text-secondary">
            <li>
              {mk.contact.line}: {SITE_CONTACT.lineId}
            </li>
            <li>
              {mk.contact.phoneLabel}:{" "}
              <a href={SITE_CONTACT.phoneHref} className="text-link underline underline-offset-2">
                {SITE_CONTACT.phoneDisplay}
              </a>
            </li>
            <li>
              {mk.contact.emailLabel}:{" "}
              <a href={`mailto:${SITE_CONTACT.email}`} className="text-link underline underline-offset-2">
                {SITE_CONTACT.email}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <p className="mx-auto w-full max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6 lg:px-8">{mk.footer.rights(YEAR)}</p>
      </div>
    </footer>
  );
}
