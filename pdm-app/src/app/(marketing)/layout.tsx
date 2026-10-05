import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

/** Public website (/). The product itself lives under /app. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
