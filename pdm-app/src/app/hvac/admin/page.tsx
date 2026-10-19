import type { Metadata } from "next";
import { AdminView } from "@/components/hvac/admin";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages();
  return { title: { absolute: `${m.hvac.titles.admin} · ${m.hvac.product}` } };
}

export default function Page() {
  return <AdminView />;
}
