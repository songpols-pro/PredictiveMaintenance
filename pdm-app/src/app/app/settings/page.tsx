import type { Metadata } from "next";
import { SettingsView } from "@/components/views/settings-view";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages();
  return { title: m.meta.titles.settings };
}

export default function Page() {
  return <SettingsView />;
}
