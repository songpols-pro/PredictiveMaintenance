import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertsView } from "@/components/views/alerts-view";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages();
  return { title: m.meta.titles.alerts };
}

export default function Page() {
  return (
    <Suspense>
      <AlertsView />
    </Suspense>
  );
}
