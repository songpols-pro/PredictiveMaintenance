import type { Metadata } from "next";
import { Suspense } from "react";
import { AlarmsView } from "@/components/hvac/alarms";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages();
  return { title: { absolute: `${m.hvac.titles.alarmLogs} · ${m.hvac.product}` } };
}

export default function Page() {
  return (
    <Suspense>
      <AlarmsView mode="logs" />
    </Suspense>
  );
}
