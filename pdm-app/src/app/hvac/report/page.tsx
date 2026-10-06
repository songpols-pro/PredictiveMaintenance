import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportView } from "@/components/hvac/report";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages();
  return { title: { absolute: `${m.hvac.titles.report} · ${m.hvac.product}` } };
}

export default function Page() {
  return (
    <Suspense>
      <ReportView />
    </Suspense>
  );
}
