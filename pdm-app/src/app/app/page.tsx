import type { Metadata } from "next";
import { OverviewView } from "@/components/views/overview-view";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages();
  return { title: m.meta.titles.overview };
}

export default function OverviewPage() {
  return <OverviewView />;
}
