import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages();
  return { title: { absolute: m.marketing.metaTitle }, description: m.marketing.metaDescription };
}

export default function HomePage() {
  return <LandingPage />;
}
