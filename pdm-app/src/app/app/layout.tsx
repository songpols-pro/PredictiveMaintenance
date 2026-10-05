import { AppShell } from "@/components/app-shell/app-shell";

/** The signed-in product lives under /app; the public marketing site is at /. */
export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
