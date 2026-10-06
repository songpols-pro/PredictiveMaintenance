import type { Metadata } from "next";
import { Suspense } from "react";
import { TrendView } from "@/components/hvac/trend";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages();
  return { title: { absolute: `${m.hvac.titles.trend} · ${m.hvac.product}` } };
}

export default function Page() {
  return (
    <Suspense>
      <TrendView />
    </Suspense>
  );
}
